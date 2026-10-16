// Incident recovery for this turn's owned specimen ONLY. Preserve every failed
// supervisor report, raw stream, and retained fixture directory. No group signal.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {census,sameInstance,signalOwned} from '../../../../g1-runtime/scripts/census.mjs';
import {sha} from '../../../../g1-runtime/scripts/build.mjs';
assert.equal(process.argv.length,2);
const here=fileURLToPath(new URL('./',import.meta.url)),out=join(here,'process-recovery-'+randomUUID()+'.json');
const record={kind:'fresh-controller-owned-process-recovery',scope:'turn38-specimens-only',pass:false,censusPerformed:false,known:[],nonces:[],before:[],signals:[],after:[],retainedFixtureRoots:[],sourceReports:[]};
const save=()=>writeFileSync(out,JSON.stringify(record,null,2)+'\n');
try{
 const owned=[];const nonces=new Set();
 for(const name of readdirSync(here).filter(n=>n.startsWith('profile-'))){
  const run=join(here,name);if(!existsSync(join(run,'result.json')))continue;
  const report=JSON.parse(readFileSync(join(run,'result.json'),'utf8'));
  for(const phase of report.phases)for(const d of phase.dispatches){
   const dir=join(run,'lanes-'+phase.lanes+'-child-'+d.lane),p=join(dir,'supervisor.json'),s=JSON.parse(readFileSync(p,'utf8'));
   assert.equal(s.nonce,d.nonce);assert.ok(/^[a-f0-9-]{36}$/.test(s.nonce));nonces.add(s.nonce);
   record.sourceReports.push({path:p,sha256:sha(readFileSync(p)),historicalCleanup:s.cleanup});
   for(const o of s.owned){assert.equal(o.nonce,s.nonce);assert.ok(o.birth&&o.command&&Number.isSafeInteger(o.ppid));if(!owned.some(x=>sameInstance(x,o)))owned.push(o);}
   const supplemental=join(dir,'births.ndjson.design-targets');
   if(existsSync(supplemental))for(const l of readFileSync(supplemental,'utf8').trim().split('\n').filter(Boolean)){
    const r=JSON.parse(l);assert.equal(r.nonce,s.nonce);
    if(existsSync(r.root))record.retainedFixtureRoots.push({path:r.root,nonce:s.nonce,targetPid:r.pid,retained:true});
   }
  }
 }
 record.nonces=[...nonces];record.known=owned;let rows=census();
 const relevant=rs=>rs.filter(p=>record.nonces.some(n=>p.command.includes(n)));
 record.censusPerformed=true;record.before=relevant(rows);save();
 for(const sig of ['SIGTERM','SIGKILL']){
  for(const o of [...owned].reverse()){
   const current=rows.find(p=>sameInstance(p,o));
   if(!current)continue;
   assert.ok(current.command.includes(o.nonce)||current.command===o.command,'Never signal reused or changed process');
   assert.ok(o.pid!==process.pid&&o.pid!==process.ppid);
   if(signalOwned(o,owned,sig))record.signals.push({pid:o.pid,birth:o.birth,nonce:o.nonce,signal:sig});
  }
  save();const end=performance.now()+1500;
  do{rows=census();if(!owned.some(o=>rows.some(p=>sameInstance(o,p)))&&!relevant(rows).length)break;await new Promise(r=>setTimeout(r,50));}while(performance.now()<end);
 }
 rows=census();record.after=relevant(rows);
 assert.equal(record.after.length,0,'Unproven nonce process retained; no blind signal');
 assert.ok(!owned.some(o=>rows.some(p=>sameInstance(o,p))),'Proven owned process residue');
 for(const p of record.sourceReports)assert.equal(sha(readFileSync(p.path)),p.sha256,'Historical cleanup report unchanged');
 record.pass=true;
}catch(e){record.error=String(e.stack??e);process.exitCode=1;}
finally{save();console.log(JSON.stringify({out,pass:record.pass,before:record.before.length,signals:record.signals.length,after:record.after.length,retainedFixtureRoots:record.retainedFixtureRoots.length,error:record.error??null}));}
