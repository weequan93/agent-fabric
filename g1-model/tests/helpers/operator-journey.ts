import assert from 'node:assert/strict';
import { OriginalCallSchema } from '../../src/schema.js';
import { waitUntil } from './process-fixture.js';
import { operatorCommand } from '../../src/operator.js';
import type { operatorInspect,operatorPreflight } from '../../src/operator-view.js';
import type { createNativeFixture } from './native-fixture.js';
import type { OwnedProcess } from './process-fixture.js';
import type { EncodedRequest } from '../../src/contracts.js';
export type OperatorDetails=Awaited<ReturnType<typeof operatorInspect>>;
export type OperatorPreflight=Awaited<ReturnType<typeof operatorPreflight>>;
export type NativeFixture=Awaited<ReturnType<typeof createNativeFixture>>;
export function result<T>(m:Record<string,unknown>):T{assert.equal(m['error'],undefined,JSON.stringify(m));return m['result'] as T;}
export function operator(n:NativeFixture,p:OwnedProcess){return (command:string,input:unknown)=>operatorCommand((kind,value)=>n.call(p,kind,value),command,input);}
export async function details(n:NativeFixture,p:OwnedProcess,sessionId:string){return result<OperatorDetails>(await operator(n,p)('operatorInspect',{sessionId}));}
export async function requestFor(n:NativeFixture,runId:string,ordinal?:number):Promise<EncodedRequest>{const row=(await n.f.admin.query('SELECT a.request FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE o.run_id=$1 AND ($2::int IS NULL OR a.ordinal=$2) ORDER BY a.ordinal DESC LIMIT 1',[runId,ordinal??null])).rows[0];assert.ok(row);return row.request as EncodedRequest;}
export function redacted(value:unknown){const s=JSON.stringify(value);for(const marker of ['NATIVE_SOURCE_PRIVATE_MARKER','providerPrivateState','private_state','sessionCredential','transportToken','controllerDsn'])assert.equal(s.includes(marker),false,marker);}
export async function noAccept(n:NativeFixture,work:()=>Promise<unknown>){const before=await n.f.counters();await work();const after=await n.f.counters();for(const k of ['accept','acceptance'])assert.equal(after[k]??0,before[k]??0);}
export async function accounted(n:NativeFixture,p:OwnedProcess,sessionId:string){const d=await details(n,p,sessionId);assert.equal(d.accounting.heldReserve,d.view.costs.reserved);assert.equal(d.accounting.measured,d.view.costs.actual);assert.equal(d.accounting.settled,d.accounting.measured);assert.equal(Object.values(d.accounting.categories).reduce((a,b)=>a+b,0),d.accounting.measured);redacted(d);return d;}
export function report(id:string,d:OperatorDetails){console.log(id+': '+d.nextAction);console.log(JSON.stringify({measurement:'operator-journey',case:id,details:d,benchmark:'unqualified; process deadlines protect tests only'}));}

/** Deterministic receipt ordering: owner COMMIT, then actual metering, then ACK.
 * The native call still owns reservation/claim/dispatch and all current checks. */
export async function completedTurn(n:NativeFixture,p:OwnedProcess,input:unknown){
 const cursor=n.f.adapter().messages.length;await n.f.arm('lost-ack');
 let returned:Record<string,unknown>|undefined;const pending=operator(n,p)('requestTurn',input).then(r=>{returned=r;return r;});
 await waitUntil(async()=>{if(returned)throw new Error('Request returned before expected receipt barrier: '+JSON.stringify(returned));return n.f.adapter().messages.slice(cursor).some(m=>m['kind']==='barrier-hit'&&m['hook']==='lost-ack');},'operator receipt before ACK');
 const original=OriginalCallSchema.parse(n.f.adapter().messages.slice(cursor).find(m=>m['kind']==='barrier-hit'&&m['hook']==='lost-ack')!['original']);
 await n.f.finalize(original);await n.f.release('lost-ack');return result<{status:string;view:OperatorDetails['view']}>(await pending);
}
