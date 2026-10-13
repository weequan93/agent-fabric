import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { cache } from '../paths.mjs';
import { processTools } from '../recovery/ownership.mjs';
import { appendJournal,readJournal } from '../custodian/journal.mjs';
import { assertRootOwned } from '../fixture.mjs';
/** Fresh current trees only. Every identity includes birth, full command, parent
 * birth and worker nonce. Historical IDs alone never authorize a signal. */
export function observeTree(rows,workers,known,j){
 for(const w of workers){
  const root=rows.find(r=>r.pid===w.pid);if(!root)continue;
  assert.equal(root.instance,w.identity.instance);assert.equal(root.command,w.identity.command);
  const pending=[root];
  while(pending.length){const parent=pending.shift();for(const row of rows.filter(r=>r.ppid===parent.pid)){
   // ps may expose pre-exec or reaping placeholders. They provide no
   // command authority and are never registered or signalled.
   if(row.command==='(node)')continue;
   const key=row.pid+'/'+row.instance,expected={...row,parentInstance:parent.instance,workerNonce:w.marker};
   if(!known.has(key)){known.set(key,expected);appendJournal(j,{phase:'descendant-born',expected});}
   else assert.deepEqual(known.get(key),expected);
   pending.push(row);
  }}
 }
}
function allowed(expected,workers){
 const w=workers.find(w=>w.marker===expected.workerNonce);assert(w);
 // Only exact current full test commands or cached test helpers with nonce.
 const command=expected.command;
 assert(command.startsWith(process.execPath+' '));
 const tail=command.slice(process.execPath.length+1);
 const file=resolve(cache,'g1-storage/tests/components/'+w.component+'.component.test.js');
 if(tail===['--test','--test-concurrency=1','--test-reporter=tap',file].join(' ')||tail===file||tail==='--test-concurrency=1 '+file)return;
 assert(tail.startsWith(resolve(cache,'g1-storage/tests/helpers/')+'/')||tail.startsWith(resolve(cache,'g1-model/tests/helpers/')+'/'));
 assert.match(tail,/\.js [a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
}
export async function settleDescendants(workers,known,j,fixtures,{cancel=false}={}){
 const {census,waitUntil}=await processTools();observeTree(census(),workers,known,j);
 const deaths=new Set();
 function verify(e){
  readJournal(j);for(const f of fixtures){assertRootOwned(f.path,f.identity);for(const r of f.roots)assertRootOwned(r.path,r.identity);}
  assert(readJournal(j).some(l=>l.event?.phase==='descendant-born'&&JSON.stringify(l.event.expected)===JSON.stringify(e)));
  const rows=census(),row=rows.find(r=>r.pid===e.pid);
  if(!row){deaths.add(e.pid+'/'+e.instance);return null;}
  allowed(e,workers);assert.equal(row.instance,e.instance);assert.equal(row.command,e.command);
  const parent=rows.find(r=>r.pid===e.ppid);
  if(parent){assert.equal(row.ppid,e.ppid);assert.equal(parent.instance,e.parentInstance);}
  else{assert.equal(row.ppid,1);assert(deaths.has(e.ppid+'/'+e.parentInstance),'Original parent death not proven');}
  assert(!rows.some(r=>r.ppid===row.pid),'Cannot signal while descendants remain');return row;
 }
 const active=census().filter(r=>[...known.values()].some(e=>e.pid===r.pid&&e.instance===r.instance));
 if(!cancel){await waitUntil(async()=>!census().some(r=>[...known.values()].some(e=>e.pid===r.pid&&e.instance===r.instance)),'all complete test descendants reaped',3000);return [];}
 const outcomes=[];
 // Current tree depth determines reverse order; no process group signals.
 const all=[...known.values()];const depth=e=>{let n=0,p=e.ppid,seen=new Set();while(all.some(x=>x.pid===p)&&!seen.has(p)){seen.add(p);n++;p=all.find(x=>x.pid===p).ppid;}return n;};
 for(const e of all.sort((a,b)=>depth(b)-depth(a))){
  const row=verify(e);if(!row){outcomes.push({expected:e,action:'already-absent'});continue;}
  appendJournal(j,{phase:'descendant-before-signal',expected:e,current:row});verify(e);process.kill(e.pid,'SIGTERM');
  try{await waitUntil(async()=>!census().some(r=>r.pid===e.pid),'current exact descendant absence',2000);}
  catch{verify(e);process.kill(e.pid,'SIGKILL');await waitUntil(async()=>!census().some(r=>r.pid===e.pid),'current exact forced descendant absence',2000);}
  assert.equal(verify(e),null);outcomes.push({expected:e,action:'removed'});appendJournal(j,{phase:'descendant-cleaned',expected:e});
 }
 return outcomes;
}
