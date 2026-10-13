import pg from 'pg';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { createPostgresAuthorityLookup } from '../../../g1-identity/src/authenticated-uow.js';
import { AuthenticatedUnitOfWork,NativeRepository,type AsyncUnitOfWork } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { EpochWitnessJournal } from '../../src/epoch-journal.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { DependencyGraphRepository } from '../../src/dependency-graph.js';
import { BackupCaptureRepository } from '../../src/backup-capture.js';
import { BackupConfirmationRepository } from '../../src/backup-confirmation.js';
import type { BackupProcessInput } from './kill-backup-process.js';
// Synthetic credentials/keys/capabilities arrive only by private IPC. No secrets,
// paths or diagnostics are emitted. This worker runs the actual installed owner.
process.once('message',async(raw:unknown)=>{
 const c=raw as BackupProcessInput,controller=new pg.Pool({connectionString:c.controllerDsn,max:1}),authority=new pg.Pool({connectionString:c.authorityDsn,max:1});let pid=0;
 try{
  const verifier=createIdentityScopeVerifier({verifyToken:token=>verifyAccessToken(token,{issuer:c.issuer,apiAudience:'storage-api',jwksUrl:c.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)});
  const s=await verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:c.token}),authenticated=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:verifier.bindingFor});
  const uow:AsyncUnitOfWork={withScope:(scope,work)=>authenticated.withScope(scope,async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);return work(tx);})};
  const native=new NativeRepository(uow,verifier.bindingFor),journal=new EpochWitnessJournal(c.authorityRoot),crypto=new CryptoStore({resolve:async()=>({dataKey:c.dataKey,digestKey:c.digestKey})}),keys={resolve:async()=>({keyId:c.keyId,generation:c.generation})},graph=new DependencyGraphRepository(uow,journal,native,crypto,keys);
  const hooks={phase:async(phase:'archive-fsynced'|'directory-fsynced')=>{if(phase===c.stopAt){process.send?.({kind:'phase',operation:c.operation,phase,pid});
   // The process listener owns the suspended continuation until the parent kills
   // this worker. An unreferenced never-settling promise lets GC abandon that
   // continuation and implicitly close the archive FileHandle before SIGKILL.
   await new Promise<void>((_resolve,reject)=>process.once('disconnect',()=>reject(new Error('Backup parent disconnected before process kill'))));
  }}};
  if(c.operation==='capture')await new BackupCaptureRepository(uow,graph,crypto,keys,c.contentRoot,c.backupRoot,hooks).capture(s,c.command);
  else await new BackupConfirmationRepository(uow,journal,native,graph,crypto,keys,c.backupRoot,hooks).confirm(s,c.command);
  process.send?.({kind:'unexpected-completion'});
 }catch{if(process.connected)process.send?.({kind:'unexpected-refusal'});}
 finally{c.dataKey.fill(0);c.digestKey.fill(0);await controller.end();await authority.end();}
});
