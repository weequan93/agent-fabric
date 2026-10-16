/** Synthetic owned adapters: real SQLite/files/processes, no provider or hostile isolation claim. */
import {DatabaseSync} from 'node:sqlite';
import {appendFileSync,closeSync,existsSync,lstatSync,mkdirSync,openSync,readFileSync,realpathSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {join,dirname,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AllocationError,SingleAssignmentAllocator,OwnedExecutor,CanonicalPromotion,queueSummary,requireWorkload,runtimeAuthority,type RuntimeStateStore,type RuntimeStateTransaction,type ComputerAssignment,type AllocationProvider,type AllocationSlot} from '../../src/allocation.js';
import {ResourceRepository,ResourceRepositoryError,type ResourceTicket} from '../../src/resource-repository.js';
import {bindingDigest,type VerifiedScope} from '../../src/owners.js';
import {SQLiteResourceStore} from './resource-repository-sqlite.js';
import {fixtureScope,fixtureId as id} from './resource-repository-client.js';
export class SQLiteRuntimeState implements RuntimeStateStore {
 readonly db:DatabaseSync;
 constructor(path:string){this.db=new DatabaseSync(path);this.db.exec('PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runtime_fixture(kind TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(kind,key));');}
 close(){this.db.close();}
 async transaction<T>(body:(tx:RuntimeStateTransaction)=>Promise<T>,beforeCommit:()=>Promise<void>):Promise<T>{
  this.db.exec('BEGIN IMMEDIATE');try{const tx:RuntimeStateTransaction={get:<U>(kind:string,key:string)=>{const r=this.db.prepare('SELECT payload FROM runtime_fixture WHERE kind=? AND key=?').get(kind,key);return r?JSON.parse(String(r['payload'])) as U:null;},put:(kind,key,value)=>{this.db.prepare('INSERT INTO runtime_fixture VALUES(?,?,?) ON CONFLICT(kind,key) DO UPDATE SET payload=excluded.payload').run(kind,key,JSON.stringify(value));},list:<U>(kind:string)=>this.db.prepare('SELECT payload FROM runtime_fixture WHERE kind=? ORDER BY key').all(kind).map(r=>JSON.parse(String(r['payload'])) as U)};
   const out=await body(tx);await beforeCommit();this.db.exec('COMMIT');return out;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 observe(){return this.db.prepare('SELECT * FROM runtime_fixture ORDER BY kind,key').all().map(r=>({kind:r['kind'],key:r['key'],value:JSON.parse(String(r['payload']))}));}
}
export const assignmentFixture:ComputerAssignment={tenantId:id(1),spaceId:id(2),assignmentId:id(5),storageBindingId:id(6)};
export class FixtureProvider implements AllocationProvider {
 constructor(private readonly store:SQLiteRuntimeState,private readonly unknownAck=false,private readonly afterCreate?:()=>Promise<void>){}
 async create(a:ComputerAssignment,key:string){
  const result=await this.store.transaction(async tx=>{
   const events=tx.get<any[]>('provider-events','all')??[];events.push({kind:'create',assignmentId:a.assignmentId,key,pid:process.pid});tx.put('provider-events','all',events);
   if(tx.get('inventory',key))throw new Error('Duplicate create forbidden, including idempotent retries');
   const result={instanceId:randomUUID(),bootId:randomUUID()};tx.put('inventory',key,{...result,assignment:a});return result;
  },async()=>{});
  await this.afterCreate?.();if(this.unknownAck)throw new Error('Provider created instance; ACK lost');return result;
 }
 async lookup(a:ComputerAssignment,key:string){return this.store.transaction(async tx=>{const events=tx.get<any[]>('provider-events','all')??[];events.push({kind:'lookup',assignmentId:a.assignmentId,key,pid:process.pid});tx.put('provider-events','all',events);const old=tx.get<any>('inventory',key);if(old&&bindingDigest(old.assignment)!==bindingDigest(a))throw new AllocationError('binding-conflict');return old?{instanceId:old.instanceId,bootId:old.bootId}:null;},async()=>{});}
}
export type QueueClientCommand={op:'ensure'|'admit'|'poll'|'lookup'|'cancel'|'execute'|'release'|'observe'|'summary'|'service'|'promote'|'driver-start'|'driver-stop'|'child-start'|'child-stop'|'close';path:string;dir:string;request?:unknown;key?:string;keys?:string[];scope?:Record<string,unknown>;accepted?:boolean;unknownAck?:boolean;allocationBarrier?:boolean;holdEffect?:boolean;workload?:{execution:'service'|'computer';trust:'same-trust'|'hostile'|'different-privilege';requiresSeparation:boolean};assignment?:ComputerAssignment;relativePath?:string;expectedVersion?:number;bytes?:string;act?:boolean;now:number};
export async function queueClientCommand(raw:QueueClientCommand,barrier:(kind:string)=>Promise<void>):Promise<unknown>{
 const state=new SQLiteRuntimeState(raw.path),resourcesStore=new SQLiteResourceStore(raw.path),proofs=new WeakSet<object>();
 try{
  if(raw.op==='observe')return {state:state.observe(),queue:resourcesStore.observe(),effects:existsSync(join(raw.dir,'effects.ndjson'))?readFileSync(join(raw.dir,'effects.ndjson'),'utf8').trim().split('\n').map(l=>JSON.parse(l)):[],target:existsSync(join(raw.dir,'target.txt'))?readFileSync(join(raw.dir,'target.txt'),'utf8'):'',active:existsSync(join(raw.dir,'active.lock'))};
  const scope=await fixtureScope(raw.scope),admitted=Object.freeze({fixture:'server-validated-computer-admission'}),act=Object.freeze({fixture:'separate-act'});
  if(['driver-start','driver-stop','child-start','child-stop'].includes(raw.op)){
   await runtimeAuthority(scope);const marker=join(raw.dir,raw.op.startsWith('driver')?'driver.json':'noncheckpointable-child.json');
   if(raw.op.endsWith('start'))writeFileSync(marker,JSON.stringify({pid:process.pid,authority:'fixture-process-only'}),{flag:'wx'});else unlinkSync(marker);return {pid:process.pid,active:raw.op.endsWith('start')};
  }
  const allocator=new SingleAssignmentAllocator(state,new FixtureProvider(state,raw.unknownAck,raw.allocationBarrier?()=>barrier('allocation-created'):undefined),{async require(s,a,original){if(!raw.accepted||original!==admitted||!s.grants.includes('task:write')||a.tenantId!==s.tenantId||a.spaceId!==s.spaceId)throw new AllocationError('admission-required');}});
  const resources=new ResourceRepository(resourcesStore,{async require(_s,t,proof){const marker=state.db.prepare("SELECT payload FROM runtime_fixture WHERE kind='execution' AND key=?").get(t.ticketId);const active=marker&&JSON.parse(String(marker['payload'])).state==='active';if(!proof||typeof proof!=='object'||!proofs.has(proof)||active||existsSync(join(raw.dir,'active.lock')))throw new ResourceRepositoryError('release-proof-required');}},()=>raw.now);
  if(raw.op==='ensure'){requireWorkload(raw.workload??{execution:'computer',trust:'same-trust',requiresSeparation:false});return await allocator.ensure(scope,raw.assignment??assignmentFixture,admitted);}
  if(raw.op==='admit'){requireWorkload(raw.workload??{execution:'computer',trust:'same-trust',requiresSeparation:false});return await resources.admit(scope,raw.request);}
  if(raw.op==='poll')return await resources.poll(scope,raw.key!);
  if(raw.op==='lookup')return await resources.lookup(scope,raw.key!);
  if(raw.op==='cancel')return await resources.cancel(scope,raw.key!);
  if(raw.op==='summary')return await queueSummary(scope,resources,raw.keys!);
  if(raw.op==='service'){
   requireWorkload(raw.workload??{execution:'service',trust:'same-trust',requiresSeparation:false});
   const {runtimeAuthority}=await import('../../src/allocation.js');await runtimeAuthority(scope,'task:read');const bytes=readFileSync(join(raw.dir,'eligible-source.txt'),'utf8');await runtimeAuthority(scope,'task:read');return {bytes,allocated:false};
  }
  if(raw.op==='release'){const proof=Object.freeze({noFixtureProcessOrStream:true});if(!existsSync(join(raw.dir,'active.lock')))proofs.add(proof);return await resources.release(scope,raw.key!,proof);}
  if(raw.op==='execute'){
   const executor=new OwnedExecutor(resources,allocator,{async run(ticket,slot){
    // OS-exclusive lock and raw effects independently expose accidental overlap.
    const lock=join(raw.dir,'active.lock');
    await state.transaction(async tx=>{
     const original=state.db.prepare('SELECT payload FROM tickets WHERE ticket_id=?').get(ticket.ticketId);
     const current=original?JSON.parse(String(original['payload'])) as ResourceTicket:null;
     if(!current||current.state!=='owned'||current.cancelRequested||bindingDigest(current.request)!==bindingDigest(ticket.request))throw new AllocationError('lease-required');
     const currentSlot=tx.get<AllocationSlot>('allocation',bindingDigest({tenantId:scope.tenantId,spaceId:scope.spaceId}));if(!currentSlot||currentSlot.state!=='ready'||currentSlot.instanceId!==slot.instanceId||currentSlot.bootId!==slot.bootId)throw new AllocationError('stale-instance');
     const owners=state.db.prepare('SELECT resource FROM owners WHERE ticket=?').all(ticket.ticketId);if(owners.length!==ticket.request.resources.length)throw new AllocationError('lease-required');
     const fd=openSync(lock,'wx');closeSync(fd);tx.put('execution',ticket.ticketId,{state:'active',pid:process.pid,instanceId:slot.instanceId});
    },()=>runtimeAuthority(scope));
    const event={pid:process.pid,taskId:ticket.request.binding.taskId,assignment:slot.assignment.assignmentId,instance:slot.instanceId,at:Date.now()};
    appendFileSync(join(raw.dir,'effects.ndjson'),JSON.stringify({...event,phase:'start'})+'\n');
    if(raw.holdEffect)await barrier('effect-started');
    appendFileSync(join(raw.dir,'target.txt'),ticket.request.binding.taskId+'\n');
    appendFileSync(join(raw.dir,'effects.ndjson'),JSON.stringify({...event,phase:'end',at:Date.now()})+'\n');
    await state.transaction(async tx=>{tx.put('execution',ticket.ticketId,{state:'quiescent',pid:process.pid,instanceId:slot.instanceId});unlinkSync(lock);},()=>runtimeAuthority(scope));
    const proof=Object.freeze({processComplete:true,streamClosed:true,pid:process.pid});proofs.add(proof);return {effectDigest:bindingDigest(readFileSync(join(raw.dir,'target.txt'),'utf8')),quiescence:proof};
   }});return await executor.execute(scope,raw.key!);
  }
  if(raw.op==='promote'){
   const root=join(raw.dir,'canonical');mkdirSync(root,{recursive:true});
   const promotion=new CanonicalPromotion(resources,{async resolve(path){
    const destination=resolve(root,path);if(!destination.startsWith(realpathSync(root)+sep))throw new AllocationError('unsafe-path');
    let ancestor=root;const parts=path.split('/');for(const [index,part] of parts.entries()){ancestor=join(ancestor,part);if(existsSync(ancestor)){const st=lstatSync(ancestor);if(st.isSymbolicLink()||(index===parts.length-1?st.isDirectory():!st.isDirectory()))throw new AllocationError('unsafe-path');}}
    return {resourceId:path==='document.txt'?id(100):id(101),relativePath:path};
   },async publish(ticket,path,expectedVersion,bytes){
    // Real descriptor walk rejects symbolic-link and tree-alias destinations.
    const destination=resolve(root,path);if(!destination.startsWith(realpathSync(root)+sep))throw new AllocationError('unsafe-path');
    let ancestor=root;const parts=path.split('/');for(const [index,part] of parts.entries()){ancestor=join(ancestor,part);if(existsSync(ancestor)){const st=lstatSync(ancestor);if(st.isSymbolicLink()||(index===parts.length-1?st.isDirectory():!st.isDirectory()))throw new AllocationError('unsafe-path');}}
    return state.transaction(async tx=>{
     const original=state.db.prepare('SELECT payload FROM tickets WHERE ticket_id=?').get(ticket.ticketId);const current=original?JSON.parse(String(original['payload'])) as ResourceTicket:null;
     if(!current||current.state!=='owned'||current.cancelRequested||bindingDigest(current.request)!==bindingDigest(ticket.request))throw new AllocationError('lease-required');
     const resource=path==='document.txt'?id(100):id(101);if(!state.db.prepare("SELECT resource FROM owners WHERE ticket=? AND resource=? AND mode='write'").get(ticket.ticketId,resource))throw new AllocationError('lease-required');
     const old=tx.get<{version:number;digest:string}>('canonical',destination);if((old?.version??0)!==expectedVersion)throw new AllocationError('revision-conflict');
     const staged=destination+'.'+ticket.ticketId+'.tmp';mkdirSync(dirname(destination),{recursive:true});writeFileSync(staged,bytes,{flag:'wx'});renameSync(staged,destination);
     const result={version:expectedVersion+1,digest:bindingDigest([...bytes])};tx.put('canonical',destination,result);return result;
    },async()=>{});
   }},{async require(_s,original){if(!raw.act||original!==act)throw new AllocationError('forbidden');}});
   return await promotion.promote(scope,raw.key!,raw.relativePath!,raw.expectedVersion!,Buffer.from(raw.bytes??''),act);
  }
  throw new Error('Unknown fixture operation');
 }finally{resourcesStore.close();state.close();}
}
