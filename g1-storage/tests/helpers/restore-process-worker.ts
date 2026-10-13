import pg from 'pg';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { createPostgresAuthorityLookup } from '../../../g1-identity/src/authenticated-uow.js';
import { AuthenticatedUnitOfWork,NativeRepository,type AsyncUnitOfWork } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { EpochWitnessJournal } from '../../src/epoch-journal.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { DependencyGraphRepository } from '../../src/dependency-graph.js';
import { BackupConfirmationRepository } from '../../src/backup-confirmation.js';
import { RestoreImportRepository } from '../../src/restore-import.js';
import { RestoreActivationRepository } from '../../src/restore-activation.js';
import { RestoreProgressRepository } from '../../src/restore-progress.js';
import { KnowledgeStatusAdmission } from '../../src/knowledge-status.js';
import type { RestoreProcessInput } from './kill-restore-process.js';
process.once('message',async(raw:unknown)=>{
 const c=raw as RestoreProcessInput&{nonce:string},controller=new pg.Pool({connectionString:c.controllerDsn,max:1}),authority=new pg.Pool({connectionString:c.authorityDsn,max:1});let pid=0,txActive=false,activationRows=0;
 const hold=async(phase:string,index:number,result?:unknown)=>{if(phase!==c.stopAt)return;if(c.nonce!==process.argv[2])throw new Error('Unowned restore process');process.send?.({kind:'phase',phase,index,pid,activationRows,operationId:c.command.targetId,nonce:c.nonce,...(result?{result}:{})});await new Promise<void>(()=>{});};
 try{
  const verifier=createIdentityScopeVerifier({verifyToken:token=>verifyAccessToken(token,{issuer:c.issuer,apiAudience:'storage-api',jwksUrl:c.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)}),s=await verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:c.token});
  const authenticated=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:verifier.bindingFor});
  const uow:AsyncUnitOfWork={withScope:(scope,work)=>authenticated.withScope(scope,async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);txActive=true;try{return await work(tx);}finally{txActive=false;}})},native=new NativeRepository(uow,verifier.bindingFor),journal=new EpochWitnessJournal(c.authorityRoot),crypto=new CryptoStore({resolve:async b=>({dataKey:b.keyId===c.keyId?c.dataKey:c.targetDataKey,digestKey:b.keyId===c.keyId?c.digestKey:c.targetDigestKey})}),keys={resolve:async()=>({keyId:c.keyId,generation:c.generation})},graph=new DependencyGraphRepository(uow,journal,native,crypto,keys),backup=new BackupConfirmationRepository(uow,journal,native,graph,crypto,keys,c.backupRoot),importer=new RestoreImportRepository(backup,crypto,c.restoreRoot,{resolve:async()=>({keyId:c.targetKeyId,rootId:c.restoreRoot.rootId})});
  const activation=new RestoreActivationRepository(importer,new KnowledgeStatusAdmission(crypto),{beforeCommit:async()=>hold('restrictions-reconciled',0),metadataImported:async tx=>{activationRows=Number((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_restore_activations WHERE operation_id=$1',[c.command.targetId])).rows[0]?.['n']);await hold('metadata-imported',0);},beforeActivationCommit:async()=>hold('before-activation-commit',0)});
  const repo=new RestoreProgressRepository(activation,{phase:async(phase,index)=>{if((phase==='item-fsynced'||phase==='item-recorded')&&index!==0)return;await hold(phase,index);}});
  const result=c.operation==='activate'?await repo.activate(s,c.command):await repo.resume(s,c.command);if(txActive)throw new Error('Activation did not exit transaction');if(c.operation==='activate')activationRows=1;await hold('after-activation-commit',0,result);process.send?.({kind:'unexpected-completion'});
 }catch{process.send?.({kind:'unexpected-refusal'});}
 finally{c.dataKey.fill(0);c.digestKey.fill(0);c.targetDataKey.fill(0);c.targetDigestKey.fill(0);await controller.end();await authority.end();}
});
