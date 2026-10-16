// Diagnostic counterexample, not a product check or cleanup implementation.
// Calls the UNCHANGED supervisor; corrupts only this specimen's owned log.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,appendFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {supervise} from '../../../../g1-runtime/scripts/process.mjs';
import {census,sameInstance,signalOwned} from '../../../../g1-runtime/scripts/census.mjs';
import {candidate,assertCandidate,assertBaseline,sha} from '../../../../g1-runtime/scripts/build.mjs';
import {verifyRaw} from '../../../../g1-runtime/scripts/result.mjs';
assert.equal(process.argv.length,2,'No arbitrary commands or limits');
const here=fileURLToPath(new URL('./',import.meta.url)),root=fileURLToPath(new URL('../../../../',import.meta.url));
const run=join(here,'cancellation-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());mkdirSync(run);
const report={kind:'unchanged-supervisor-cancellation-counterexample',acceptance:false,fullMatrixFit:false,
 remoteQualified:false,success:false,scenes:[],recovery:[],sentinel:null,cleanupConfirmed:false};
const initial=candidate().digest;report.candidate=initial;
report.inputs=Object.fromEntries(['process.mjs','supervisor.mjs','bootstrap.mjs','birth-ack.mjs','census.mjs'].map(n=>[n,sha(readFileSync(join(root,'g1-runtime/scripts',n)))]));
const write=()=>writeFileSync(join(run,'result.json'),JSON.stringify(report,null,2)+'\n');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=4500){const end=performance.now()+ms;do{const value=fn();if(value)return value;await pause(15);}while(performance.now()<end);throw new Error('Bounded specimen barrier not reached');}
function ownActor(dir,role,nonce){
 const p=join(dir,role+'-ready.json');if(!existsSync(p))return null;
 const r=JSON.parse(readFileSync(p,'utf8'));assert.equal(r.nonce,nonce);
 const actual=census().find(x=>x.pid===r.pid);if(!actual)return null;
 assert.equal(actual.ppid,r.ppid);assert.ok(actual.command.includes(nonce));return {...actual,nonce};
}
const known=[];let sentinelChild;
async function recover(actors,label){
 const rec={label,before:[],signals:[],after:[],confirmed:false};report.recovery.push(rec);
 let rows=census();rec.before=rows.filter(p=>actors.some(o=>sameInstance(p,o)));
 for(const sig of ['SIGTERM','SIGKILL']){
  for(const o of [...actors].reverse()){
   const live=rows.find(p=>sameInstance(p,o));if(!live)continue;
   assert.ok(live.command.includes(o.nonce));assert.notEqual(o.pid,process.pid);assert.notEqual(o.pid,process.ppid);
   if(signalOwned(o,actors,sig))rec.signals.push({pid:o.pid,birth:o.birth,nonce:o.nonce,signal:sig});
  }
  const end=performance.now()+1500;
  do{rows=census();if(!actors.some(o=>rows.some(p=>sameInstance(o,p))))break;await pause(25);}while(performance.now()<end);
 }
 rec.after=rows.filter(p=>actors.some(o=>sameInstance(p,o)));assert.equal(rec.after.length,0);rec.confirmed=true;write();
}
try{
 assertBaseline();census();
 const sentinelDir=join(run,'sentinel');mkdirSync(sentinelDir);const sentinelNonce=randomUUID();
 sentinelChild=spawn(process.execPath,[join(here,'actor.mjs'),'sentinel',sentinelDir,sentinelNonce],{cwd:root,stdio:'ignore',execArgv:[]});
 const sentinel=await until(()=>ownActor(sentinelDir,'sentinel',sentinelNonce));known.push(sentinel);report.sentinel={instance:sentinel,checks:[]};
 for(const mode of ['valid-births','invalid-nonce-prefix']){
  const dir=join(run,mode);mkdirSync(dir);const nonce=randomUUID(),abort=new AbortController();
  const scene={mode,nonce,actors:[],expectedProductVerdict:'fail-cancelled',diagnosticObserved:false};report.scenes.push(scene);write();
  // Attach both handlers immediately so expected rejection cannot be unhandled.
  const outcome=supervise({args:[join(here,'actor.mjs'),'root',dir,nonce],cwd:root,evidence:dir,nonce,
   timeoutMs:6000,signal:abort.signal,env:{RUNTIME_CANDIDATE:initial}}).then(value=>({resolved:true,value}),e=>({resolved:false,error:String(e.stack??e)}));
  try{
   for(const role of ['root','grandchild']){
    const o=await until(()=>ownActor(dir,role,nonce));scene.actors.push(o);known.push(o);
    await until(()=>existsSync(join(dir,'births.ndjson.'+o.pid+'.ack')));
    const ack=JSON.parse(readFileSync(join(dir,'births.ndjson.'+o.pid+'.ack'),'utf8'));
    assert.equal(ack.nonce,nonce);assert.equal(ack.birth,o.birth);assert.equal(ack.pid,o.pid);
   }
   assert.equal(scene.actors[1].ppid,scene.actors[0].pid);
   scene.barrier={bothBirthsAcknowledged:true,actorsPresentInFreshOS:true};
   if(mode==='invalid-nonce-prefix'){
    const bad={nonce:randomUUID(),pid:scene.actors[1].pid,ppid:scene.actors[1].ppid};
    appendFileSync(join(dir,'births.ndjson'),JSON.stringify(bad)+'\n');scene.injectedBirth=bad;
   }
   abort.abort();scene.wrapper=await outcome;
   assert.equal(scene.wrapper.resolved,false,'Cancellation always fails the product invocation');
   const s=JSON.parse(readFileSync(join(dir,'supervisor.json'),'utf8'));scene.supervisor=s;
   verifyRaw(dir,s.rawStreams);scene.rawReportSha256=sha(readFileSync(join(dir,'supervisor.json')));
   scene.postReportLive=census().filter(p=>scene.actors.some(o=>sameInstance(p,o)));
   assert.ok(s.error,'Cancelled result must retain a failure reason');assert.equal(s.nonce,nonce);
   if(mode==='valid-births'){
    assert.equal(s.cleanup.confirmed,true);assert.equal(scene.postReportLive.length,0);assert.equal(s.streamsComplete,true);
   }else{
    assert.equal(s.cleanup.confirmed,false);assert.match(s.cleanup.error,/Unproven descendant birth/);
    assert.equal(s.signals.length,0,'Birth validation throws before known-tree signaling');
    assert.ok(scene.postReportLive.length>0,'Concrete known-owned process survives failed cleanup');
    assert.equal(s.streamsComplete,false);
   }
   scene.diagnosticObserved=true;
  }finally{
   abort.abort();await outcome;await recover(scene.actors,mode);
   const s=census().find(p=>sameInstance(p,sentinel));assert.ok(s,'Unrelated actual sentinel must survive tested and independent cleanup');
   report.sentinel.checks.push({after:mode,present:true});write();
   const p=join(dir,'supervisor.json');if(scene.rawReportSha256)assert.equal(sha(readFileSync(p)),scene.rawReportSha256,'Historical failed report must not be rewritten');
  }
 }
 assertCandidate(initial);assertBaseline();report.success=true;
}catch(e){report.error=String(e.stack??e);process.exitCode=1;}
finally{
 try{
  await recover(known,'final-known-birth-census');
  const nonces=new Set(known.map(o=>o.nonce));report.finalNonceResidue=census().filter(p=>[...nonces].some(n=>p.command.includes(n)));
  assert.equal(report.finalNonceResidue.length,0);assertCandidate(initial);assertBaseline();report.cleanupConfirmed=true;
 }catch(e){report.recoveryError=String(e.stack??e);report.success=false;process.exitCode=1;}
 report.binding={probeSha256:sha(readFileSync(fileURLToPath(import.meta.url))),actorSha256:sha(readFileSync(join(here,'actor.mjs')))};write();
 console.log(JSON.stringify({run,success:report.success,cleanupConfirmed:report.cleanupConfirmed,acceptance:false,error:report.error??null}));
}
