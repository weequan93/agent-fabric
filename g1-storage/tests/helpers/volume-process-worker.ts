import pg from 'pg';
import {CryptoStore} from '../../src/crypto-store.js';
import {AuthenticatedUnitOfWork,createPostgresAuthorityLookup} from '../../../g1-identity/src/authenticated-uow.js';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {NativeRepository,type SqlTransaction} from '../../src/owners.js';
import {demand} from '../../src/errors.js';
import {volumeVerificationOwner} from './volume-verification-owner.js';
import type {ArtifactProcessInput} from './artifact-process-worker.js';
import type {VolumeCommand} from '../../src/volume-drafts.js';
type Input=ArtifactProcessInput&{volumeCommand:VolumeCommand;commands:VolumeCommand[];valid:boolean;currentGeneration:string};
const send=(v:unknown)=>{demand(process.send);process.send(v);};
process.once('message',async(raw:unknown)=>{
 const init=raw as {kind:string;value:Input};demand(init.kind==='install');const c=init.value;demand(process.argv[2]===c.nonce);
 const application=`artifact-${process.pid}-${c.nonce}`,controller=new pg.Pool({connectionString:c.controllerDsn,max:1,application_name:application,connectionTimeoutMillis:2000}),authority=new pg.Pool({connectionString:c.authorityDsn,max:1,application_name:application+'-auth',connectionTimeoutMillis:2000});let release:(()=>void)|undefined;
 try{
  const verifier=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:c.issuer,apiAudience:'storage-api',jwksUrl:c.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)}),scope=await verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:c.token});
  const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:verifier.bindingFor}),native=new NativeRepository(uow,verifier.bindingFor),crypto=new CryptoStore({resolve:async()=>({dataKey:c.dataKey,digestKey:c.digestKey})});
  const gate=async(phase:string,uploadId?:string,tx?:SqlTransaction)=>{
   if(Array.isArray(c.gate)?!c.gate.includes(phase):c.gate!==phase)return;const hold=new Promise<void>(r=>release=r);
   const backend=tx?(await tx.query('SELECT pg_backend_pid() AS pid,(SELECT count(*)::int FROM fabric.storage_volume_versions WHERE command_key=$1) AS versions',[c.volumeCommand.key])).rows[0]:null;
   send({kind:'phase',phase,uploadId:uploadId??null,pid:process.pid,nonce:c.nonce,backend});await hold;release=undefined;
  };
  const repo=volumeVerificationOwner({...c,uow,native,scope,crypto},{files:{phase:(p,id)=>gate(p,id)},beforeArtifactPublication:tx=>gate('before-publication',undefined,tx),afterArtifactWrite:tx=>gate('logical-written',undefined,tx),beforeWitnessAck:()=>gate('after-publication')});let busy=false;
  process.on('message',(raw:unknown)=>{const m=raw as {kind:string;request:string;ref:unknown};if(m.kind==='release'){demand(release);release();return;}demand(!busy);busy=true;
   void(async()=>{try{let value:unknown;
    if(m.kind==='prepare')value=await repo.prepare(scope,c.volumeCommand);
    else if(m.kind==='commit')value=await repo.commit(scope,c.volumeCommand);
    else if(m.kind==='lookup')value=await repo.lookup(scope,c.volumeCommand);
    else if(m.kind==='checkpoint')value=await repo.checkpointInventory(scope,m.ref);
    else if(m.kind==='compare'){const r=await repo.compare(scope,m.ref);try{value={...r,draft:{...r.draft,bytes:Buffer.from(r.draft.bytes)},current:r.current?{...r.current,bytes:Buffer.from(r.current.bytes)}:null};}finally{r.draft.bytes.fill(0);r.current?.bytes.fill(0);}}
    else if(m.kind==='read'||m.kind==='current'||m.kind==='canonical'){const r=m.kind==='read'?await repo.read(scope,m.ref):m.kind==='current'?await repo.current(scope,c.volumeCommand.targetId):await repo.canonical(scope,c.volumeCommand.targetId);try{value={...r,bytes:Buffer.from(r.bytes)};}finally{r.bytes.fill(0);}}
    else if(m.kind==='editor'){send({kind:'editor-held',pid:process.pid,nonce:c.nonce,byteLength:Buffer.from((c.volumeCommand as {bytes:string}).bytes,'base64').length});value={status:'unsaved',receipt:null};}
    else throw new Error('Unknown installed volume operation');send({kind:'result',request:m.request,value});
   }catch(e){send({kind:'refused',request:m.request,code:String((e as {code?:string}).code??'untyped')});}finally{busy=false;}})();
  });send({kind:'ready',pid:process.pid,owner:c.owner,instance:c.instance,nonce:c.nonce,application});
 }catch{send({kind:'startup-refused'});await Promise.all([controller.end(),authority.end()]);c.dataKey.fill(0);c.digestKey.fill(0);process.on('message',()=>{});}
});
