import {createHash} from 'node:crypto';
import type {ProcessRow} from '../../../g1-model/tests/helpers/process-fixture.js';

export const atomicPhases=[
 ['revision','storage_knowledge_revisions',1,3],
 ['head','storage_current_heads',0,1],
 ['receipt','storage_save_receipts',31,63],
 ['event','storage_save_events',15,31],
 ['outbox','storage_outbox',7,15]
] as const;
export const atomicPhaseAllocation=Array.from({length:5},(_,i)=>atomicPhases.flatMap(([name,table,before,after])=>
 (['BEFORE','AFTER'] as const).map(timing=>({id:`AD01/r${String(i+1).padStart(2,'0')}/${name}-${timing.toLowerCase()}`,round:i+1,table,timing,expectedMask:timing==='BEFORE'?before:after})))).flat();
export const atomicHostileNames=['omitted-repetition','duplicate-repetition','unmatched-worker-nonce','changed-backend-start','wrong-observed-mask','exit-only-disconnection','late-disconnection','saved-response','rollback-mismatch','lookup-mismatch'] as const;
export type BackendIdentity={pid:number;backend_start:string;usename:string;application_name:string;state:string;wait_event_type:string|null;wait_event:string|null};
export type WorkerDisconnection={
 pid:number;nonce:string;identity:ProcessRow;owner:string;instance:string;application:string;
 signal:'SIGKILL';signalDispatchMs:number;observedGoneMs:number;elapsedMs:number;
 before:BackendIdentity[];polls:{observedAtMs:number;connections:BackendIdentity[]}[];
 processAbsent:boolean;portClosed:boolean;outputBytes:number;
};
export type AtomicPhaseRecord={
 table:string;timing:'BEFORE'|'AFTER';expectedMask:number;commandKey:string;targetId:string;
 fixture:{owner:string;instance:string;root:string;controllerRole:string;authorityRole:string};
 worker:{pid:number;nonce:string;identity:ProcessRow;application:string};
 lock:{backendPid:number;backendStart:string;application:string;role:string;mask:number;blockers:number[];blockerPid:number;blockerStart:string};
 disconnect:WorkerDisconnection;caller:WorkerDisconnection;
 savedResponse:boolean;requestStatus:string|null;
 beforeDigest:string;afterDigest:string;finalDigest:string;effects:number[];
 anchorBefore:string;anchorAfter:string;
 lookup:{status:number;body:Record<string,unknown>};
 startedMs:number;finishedMs:number;observationIntervals:{startedMs:number;finishedMs:number}[];
};
export const atomicDigest=(value:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Validate actual results from the shared real HTTP/PG phase body. This same
 * verifier is invoked in-process and by every hostile subprocess. */
export function verifyAtomicPhaseRecords(records:AtomicPhaseRecord[],ids:string[]):void{
 const fail=(code:string):never=>{throw new Error('ATOMIC_DISCONNECT_REJECT:'+code);};
 const require=(condition:unknown,code:string)=>{if(!condition)fail(code);};
 require(Array.isArray(records)&&records.length===50&&ids.length===50,'omitted-repetition');
 require(new Set(ids).size===50,'duplicate-repetition');
 const commands=new Set<string>(),targets=new Set<string>(),workers=new Set<string>(),rounds=new Map<number,string>();
 let precedingEnd=0;
 for(let i=0;i<50;i++){
  const r=records[i]!,a=atomicPhaseAllocation[i]!;
  require(ids[i]===a.id,'duplicate-repetition');
  require(r.table===a.table&&r.timing===a.timing&&r.expectedMask===a.expectedMask&&r.lock.mask===a.expectedMask,'wrong-observed-mask');
  require(Number.isFinite(r.startedMs)&&r.startedMs>=precedingEnd&&r.finishedMs>r.startedMs,'phase-time');precedingEnd=r.finishedMs;
  require(!commands.has(r.commandKey)&&!targets.has(r.targetId)&&r.commandKey!==r.targetId,'command-identity');commands.add(r.commandKey);targets.add(r.targetId);
  const fixture=r.fixture.owner+'/'+r.fixture.instance;
  if(rounds.has(a.round))require(rounds.get(a.round)===fixture,'fixture-identity');else{require(![...rounds.values()].includes(fixture),'fixture-identity');rounds.set(a.round,fixture);}
  require(Boolean(r.fixture.root)&&r.fixture.controllerRole!==r.fixture.authorityRole,'fixture-identity');
  const identity=r.worker;
  require(identity.application===`atomic-${identity.pid}-${identity.nonce}`&&identity.identity.pid===identity.pid&&identity.identity.command.includes(identity.nonce)&&Boolean(identity.identity.instance)&&identity.identity.ppid>0,'unmatched-worker-nonce');
  require(!workers.has(identity.nonce),'duplicate-repetition');workers.add(identity.nonce);
  const d=r.disconnect;
  require(d.nonce===identity.nonce&&d.pid===identity.pid&&d.application===identity.application&&JSON.stringify(d.identity)===JSON.stringify(identity.identity),'unmatched-worker-nonce');
  require(d.owner===r.fixture.owner&&d.instance===r.fixture.instance,'fixture-identity');
  require(r.lock.application===identity.application&&r.lock.role===r.fixture.controllerRole&&r.lock.blockers.includes(r.lock.blockerPid)&&r.lock.blockerPid>0&&Boolean(r.lock.blockerStart),'lock-identity');
  const backend=d.before.find(b=>b.pid===r.lock.backendPid);
  require(backend?.backend_start===r.lock.backendStart,'changed-backend-start');
  require(backend?.application_name===identity.application&&backend.usename===r.fixture.controllerRole&&backend.wait_event_type==='Lock','lock-identity');
  for(const gone of [d,r.caller]){
   require(gone.application===`atomic-${gone.pid}-${gone.nonce}`&&gone.identity.pid===gone.pid&&gone.identity.command.includes(gone.nonce)&&Boolean(gone.identity.instance)&&gone.owner===r.fixture.owner&&gone.instance===r.fixture.instance,'unmatched-worker-nonce');
   require(gone.signal==='SIGKILL'&&gone.processAbsent&&gone.portClosed&&gone.outputBytes===0,'worker-closure');
   require(Array.isArray(gone.before)&&gone.before.length>=2&&Array.isArray(gone.polls)&&gone.polls.length>0,'exit-only-disconnection');
   require(gone.before.some(b=>b.application_name===gone.application&&b.usename===r.fixture.controllerRole)&&gone.before.some(b=>b.application_name===gone.application+'-auth'&&b.usename===r.fixture.authorityRole),'connection-identity');
   require(new Set(gone.before.map(b=>b.pid)).size===gone.before.length&&gone.before.every(b=>b.pid>0&&Boolean(b.backend_start)&&[gone.application,gone.application+'-auth'].includes(b.application_name)),'connection-identity');
   let previous=gone.signalDispatchMs;
   require(Number.isFinite(previous)&&previous>=r.startedMs,'disconnect-time');
   for(const p of gone.polls){require(Number.isFinite(p.observedAtMs)&&p.observedAtMs>=previous,'disconnect-time');previous=p.observedAtMs;}
   const zero=gone.polls.find(p=>p.connections.length===0);
   require(zero!==undefined&&gone.polls.at(-1)===zero,'exit-only-disconnection');
   require(zero!.observedAtMs===gone.observedGoneMs&&gone.elapsedMs===gone.observedGoneMs-gone.signalDispatchMs&&gone.elapsedMs>=0&&gone.elapsedMs<=2000&&gone.observedGoneMs<=r.finishedMs,'late-disconnection');
   for(const p of gone.polls)for(const b of p.connections){const original=gone.before.find(x=>x.pid===b.pid);require(original&&original.backend_start===b.backend_start&&original.application_name===b.application_name,'changed-backend-start');}
  }
  require(r.caller.pid!==identity.pid&&r.caller.nonce!==identity.nonce,'caller-identity');
  require(!workers.has(r.caller.nonce),'duplicate-repetition');workers.add(r.caller.nonce);
  require(!r.savedResponse&&r.requestStatus!=='saved-here','saved-response');
  require(/^sha256:[a-f0-9]{64}$/.test(r.beforeDigest)&&r.beforeDigest===r.afterDigest&&r.beforeDigest===r.finalDigest&&r.effects.length===6&&r.effects.every(n=>n===0)&&r.anchorBefore===r.anchorAfter,'rollback-mismatch');
  require(r.lookup.status===200&&JSON.stringify(r.lookup.body)===JSON.stringify({schemaVersion:1,status:'absent-safe',key:r.commandKey,replayAllowed:false,nextAction:'inspect-current-authority'}),'lookup-mismatch');
 }
 require(rounds.size===5,'fixture-identity');
}
