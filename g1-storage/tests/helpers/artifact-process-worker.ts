import pg from 'pg';
import {CryptoStore} from '../../src/crypto-store.js';
import {ArtifactPublicationRepository,type ArtifactCommand,type ArtifactHooks} from '../../src/artifact-publication.js';
import {EpochWitnessJournal,type OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {StagingWitnessJournal} from '../../src/staging-witness.js';
import {AuthenticatedUnitOfWork,createPostgresAuthorityLookup} from '../../../g1-identity/src/authenticated-uow.js';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {NativeRepository,type SqlTransaction} from '../../src/owners.js';
import {BindingSchema} from '../../src/schema.js';
import {demand} from '../../src/errors.js';
export interface ArtifactProcessInput {
 owner:string;instance:string;nonce:string;controllerDsn:string;authorityDsn:string;
 issuer:string;jwksUrl:string;token:string;tenantId:string;spaceId:string;
 authorityRoot:OwnedAnchorRoot;root:OwnedAnchorRoot;witnessRoot:OwnedAnchorRoot;
 dataKey:Buffer;digestKey:Buffer;keyId:string;generation:string;retentionExpiresAt:string;
 command:ArtifactCommand;gate:string|readonly string[]|null;
}
const send=(value:unknown)=>{demand(process.send);process.send(value);};
process.once('message',async(raw:unknown)=>{
 const init=raw as {kind:string;value:ArtifactProcessInput};demand(init.kind==='install');const c=init.value;
 demand(process.argv[2]===c.nonce);
 const application=`artifact-${process.pid}-${c.nonce}`,controller=new pg.Pool({connectionString:c.controllerDsn,max:1,application_name:application,connectionTimeoutMillis:2000}),authority=new pg.Pool({connectionString:c.authorityDsn,max:1,application_name:application+'-auth',connectionTimeoutMillis:2000});
 let release:(()=>void)|undefined;
 try{
  const verifier=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:c.issuer,apiAudience:'storage-api',jwksUrl:c.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)}),scope=await verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:c.token});
  const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:verifier.bindingFor}),native=new NativeRepository(uow,verifier.bindingFor),crypto=new CryptoStore({resolve:async()=>({dataKey:c.dataKey,digestKey:c.digestKey})}),binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'artifact',id:c.command.targetId,revision:1,keyId:c.keyId,generation:c.generation});
  const fingerprint=await crypto.fingerprint(binding,'command',Buffer.from(JSON.stringify(c.command)));
  const gate=async(phase:string,uploadId?:string,tx?:SqlTransaction)=>{
   if(Array.isArray(c.gate)?!c.gate.includes(phase):phase!==c.gate)return;
   const held=new Promise<void>(r=>release=r);
   const rows=tx?(await tx.query('SELECT pg_backend_pid() AS pid,(SELECT count(*)::int FROM fabric.storage_artifact_versions WHERE command_key=$1) AS versions',[c.command.key])).rows[0]:null;
   send({kind:'phase',phase,uploadId:uploadId??null,pid:process.pid,nonce:c.nonce,backend:rows});await held;release=undefined;
  };
  const hooks:ArtifactHooks={files:{phase:(p,id)=>gate(p,id)},beforeArtifactPublication:tx=>gate('before-publication',undefined,tx),beforeWitnessAck:()=>gate('after-publication')};
  const repo=new ArtifactPublicationRepository(uow,new EpochWitnessJournal(c.authorityRoot),native,crypto,c.root,new StagingWitnessJournal(c.witnessRoot),{current:async()=>({rootId:c.root.rootId,keyId:c.keyId,generation:c.generation}),resolve:async()=>({rootId:c.root.rootId,keyId:c.keyId,generation:c.generation,retentionExpiresAt:c.retentionExpiresAt})},{require:async(tx,s,r)=>{
   demand(s.tenantId===scope.tenantId&&s.spaceId===scope.spaceId&&s.actorId===scope.actorId,'UNAUTHORIZED');demand(r.validationId===c.command.validationId&&r.commandFingerprint===fingerprint&&JSON.stringify(r.binding)===JSON.stringify(binding),'CHECK_BINDING_MISMATCH');demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[c.command.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
  }},hooks);
  let busy=false;
  process.on('message',(raw:unknown)=>{
   const m=raw as {kind:string;request:string;ref:unknown};
   if(m.kind==='release'){demand(release);release();return;}
   if(m.kind==='close'){demand(!busy);void Promise.all([controller.end(),authority.end()]).then(()=>{c.dataKey.fill(0);c.digestKey.fill(0);send({kind:'closed'});process.disconnect();});return;}
   demand(!busy);busy=true;
   void (async()=>{
    try{let value:unknown;
     if(m.kind==='prepare')value=await repo.prepare(scope,c.command);
     else if(m.kind==='commit')value=await repo.commit(scope,c.command);
     else if(m.kind==='lookup')value=await repo.lookup(scope,c.command);
     else if(m.kind==='collect')value=await repo.collect(scope);
     else if(m.kind==='read'){const r=await repo.read(scope,m.ref);try{value={bytes:Buffer.from(r.bytes),manifest:r.manifest};}finally{r.bytes.fill(0);}}
     else throw new Error('Unknown installed operation');
     send({kind:'result',request:m.request,value});
    }catch(e){send({kind:'refused',request:m.request,code:String((e as {code?:string}).code??'untyped')});}finally{busy=false;}
   })();
  });
  send({kind:'ready',pid:process.pid,owner:c.owner,instance:c.instance,nonce:c.nonce,application});
 }catch{send({kind:'startup-refused'});await Promise.all([controller.end(),authority.end()]);c.dataKey.fill(0);c.digestKey.fill(0);process.exitCode=1;process.disconnect();}
});
