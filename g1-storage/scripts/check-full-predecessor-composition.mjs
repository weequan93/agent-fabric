// Fixed hostile controls. Only the separate real full gates qualify product behavior.
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {encodeNativeProof,decodeNativeProof,emitNativeProof,nativeProofLimits} from './native-proof-transport.mjs';
import {encodePackedNativeProof,decodePackedNativeProof,emitPackedNativeProof} from './native-proof-packed-transport.mjs';
import {packNativeProofBytes,unpackNativeProofBytes,nativeDictionaryLimits} from './native-proof-dictionary.mjs';
import {createNativeProofAttempt} from './native-proof-retention.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,cpSync,mkdirSync,readdirSync,symlinkSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {cwd,root,cache} from './paths.mjs';
import {assertBaseline} from './guards.mjs';
import {assertExecutionPreservation} from './execution-preservation.mjs';
import {assertCompositionPreservation,compositionDigest as hash} from './composition-preservation.mjs';
import {assertManifest} from './registry.mjs';
import {assertRecoveryPins,containers} from './recovery/ownership.mjs';
import {candidateSnapshot} from './candidate.mjs';
import {withStorageFixture} from './fixture.mjs';
import {fullDescriptor,createFullContext,registrationBinding,validateFullTap,validateFullObservations} from './full-composition.mjs';
import {drainOutput,writeDrained} from './measurement-transport.mjs';
import {encodeFullReceipt,decodeFullReceipt} from './full-receipt-transport.mjs';
import {encodeFullDiagnostic} from './full-diagnostic-transport.mjs';
import {encodeNativeControlPayload,decodeNativeControlPayload} from './native-control-payload.mjs';

if(process.argv.length!==2)throw new Error('Full composition checker accepts no arguments');
const candidate=candidateSnapshot(),started=performance.now(),errors=[],proof={measurement:'storage-hostile-full-composition',structuralOnly:true,productQualification:false,externalQualification:'pending',candidate,tapControls:[],sourceControls:[],transportControls:[],diagnosticControls:[],markerControls:[],controlPayloadControls:[],nativeControlPreservationControls:[],nativeProofControls:[],nativeProofPreservationControls:[],nativeGeneratedPreservationControls:[],nativePackedPreservationControls:[],nativePackedProofControls:[],nativePackedOutputControls:[],nativePackedRetentionControls:[],nativePackedRepresentationControls:[],preservationControls:[],nativeChildren:[],fixtures:[],positives:[]};
const retentionSourceDigest=hash(readFileSync(resolve(cwd,'scripts/native-proof-retention.mjs')));
const nativeAttempt=createNativeProofAttempt(resolve(root,'docs/loop/agent-fabric-g1-f05-storage/native-attempts'),candidate,retentionSourceDigest);
proof.nativeProofRetention=nativeAttempt.reference;
function retainNativeChild(child,result){nativeAttempt.appendChild(child,result);}
// Expose an owned reference even if an original assertion stops the attempt.
try{await writeDrained(process.stdout,JSON.stringify({measurement:'storage-native-proof-attempt',...nativeAttempt.reference})+'\n');}
catch(error){nativeAttempt.recordFailure(error,'attempt-reference');throw error;}
const directory=mkdtempSync('/private/tmp/agent-fabric-full-composition-controls-'),before=containers();
function preservationControls(){
 const copy=resolve(directory,'preservation-copy');
 cpSync(cwd,copy,{recursive:true,filter:path=>!path.split('/').includes('node_modules')});
 const recordPath=resolve(copy,'verification/full-receipt-correction-extension-v1.json');
 const correction=JSON.parse(readFileSync(recordPath,'utf8'));
 const run=(id,all,accepted,reason)=>{
  const code=`import {assertCompositionPreservation} from ${JSON.stringify(pathToFileURL(resolve(copy,'scripts/composition-preservation.mjs')).href)};import {assertExecutionPreservation} from ${JSON.stringify(pathToFileURL(resolve(copy,'scripts/execution-preservation.mjs')).href)};assertCompositionPreservation({all:${all}});assertExecutionPreservation();console.log('closed-preservation-pass');`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
  proof.nativeChildren.push({kind:'preservation',id,all,source:code,status:r.status,stdout:r.stdout,stderr:r.stderr,structuralOnly:true,productQualification:false});retainNativeChild(proof.nativeChildren.at(-1),r);
  assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,accepted?0:1,r.stderr);
  if(accepted)assert.match(r.stdout,/closed-preservation-pass/);else{assert.doesNotMatch(r.stdout,/closed-preservation-pass/);assert.match(r.stderr,reason);}
  proof.preservationControls.push({id,all,accepted,structuralOnly:true,productQualification:false});
 };
 const mutate=(path,body)=>{const file=resolve(copy,path),old=readFileSync(file);try{body(file,old);}finally{writeFileSync(file,old);}};
 run('unchanged-default',false,true);run('unchanged-all',true,true);
 for(const path of [...Object.keys(correction.files),...Object.keys(correction.added)])for(const mode of ['missing','changed'])mutate(path,(file,old)=>{
  if(mode==='missing')rmSync(file);else writeFileSync(file,Buffer.concat([old,Buffer.from('\n// deliberate sealed-source corruption\n')]));
  run(path+'/'+mode,false,false,/Sealed receipt correction|Sealed native control|Sealed native proof|Sealed native generated|Sealed native packed|ERR_MODULE_NOT_FOUND|ENOENT/);
 });
 for(const path of ['src/schema.ts','scripts/fixture.mjs'])for(const mode of ['missing','changed'])mutate(path,(file,old)=>{
  if(mode==='missing')rmSync(file);else writeFileSync(file,Buffer.concat([old,Buffer.from('\n// deliberate ordinary-source corruption\n')]));
  run(path+'/'+mode+'/default',false,true);
  run(path+'/'+mode+'/all',true,false,/All 1116 correction predecessor bytes|All 1119 native control predecessor bytes|All 1122 native proof predecessor bytes|All 1125 native generated predecessor bytes|All 1127 native packed predecessor bytes|ENOENT/);
 });
 for(const mode of ['extra-key','version','predecessor-digest','predecessor-file','missing-change','extra-addition','old-reader-as-current','duplicate-key'])mutate('verification/full-receipt-correction-extension-v1.json',(file,old)=>{
  const r=JSON.parse(old);
  if(mode==='extra-key')r.ignored=true;if(mode==='version')r.schemaVersion=2;
  if(mode==='predecessor-digest')r.predecessor.digest='sha256:'+'0'.repeat(64);
  if(mode==='predecessor-file')r.predecessor.files[0][1]='0'.repeat(64);
  if(mode==='missing-change')delete r.files['scripts/receipt-preservation.mjs'];
  if(mode==='extra-addition')r.added['scripts/fixture.mjs']='sha256:'+'0'.repeat(64);
  if(mode==='old-reader-as-current')r.files['scripts/receipt-preservation.mjs'].currentDigest=r.files['scripts/receipt-preservation.mjs'].predecessorDigest;
  let raw=JSON.stringify(r,null,2)+'\n';if(mode==='duplicate-key')raw=raw.replace('"schemaVersion": 1,','"schemaVersion": 1,\n  "schemaVersion": 1,');
  writeFileSync(file,raw);run('record/'+mode,false,false,/AssertionError/);
 });
 assert.equal(proof.preservationControls.length,32);
 // The original 32 facilities stay intact. These additional controls exercise
 // the new bootstrap and closed metadata before any older layer evaluates it.
 const nativeRecord=JSON.parse(readFileSync(resolve(copy,'verification/full-native-control-extension-v1.json'),'utf8'));
 const nativeRun=(id,reason)=>{
  const start=proof.preservationControls.length;run('native-control/'+id,false,false,reason);
  proof.nativeControlPreservationControls.push(proof.preservationControls.pop());assert.equal(proof.preservationControls.length,start);
 };
 for(const path of [...Object.keys(nativeRecord.files),...Object.keys(nativeRecord.added)])for(const mode of ['missing','changed'])mutate(path,(file,old)=>{
  if(mode==='missing')rmSync(file);else writeFileSync(file,Buffer.concat([old,Buffer.from('\n// deliberate native-bootstrap source corruption\n')]));
  nativeRun(path+'/'+mode,/Sealed native control|Sealed native proof|Sealed native generated|Sealed native packed|ERR_MODULE_NOT_FOUND|ENOENT/);
 });
 mutate('verification/full-native-control-extension-v1.json',file=>{rmSync(file);nativeRun('record/missing',/ENOENT/);});
 for(const mode of ['extra-key','version','predecessor-digest','predecessor-file','missing-change','extra-addition','old-reader-as-current','duplicate-key'])mutate('verification/full-native-control-extension-v1.json',(file,old)=>{
  const r=JSON.parse(old);
  if(mode==='extra-key')r.ignored=true;if(mode==='version')r.schemaVersion=2;
  if(mode==='predecessor-digest')r.predecessor.digest='sha256:'+'0'.repeat(64);
  if(mode==='predecessor-file')r.predecessor.files[0][1]='0'.repeat(64);
  if(mode==='missing-change')delete r.files['scripts/receipt-correction-preservation.mjs'];
  if(mode==='extra-addition')r.added['scripts/fixture.mjs']='sha256:'+'0'.repeat(64);
  if(mode==='old-reader-as-current')r.files['scripts/receipt-correction-preservation.mjs'].currentDigest=r.files['scripts/receipt-correction-preservation.mjs'].predecessorDigest;
  let raw=JSON.stringify(r,null,2)+'\n';if(mode==='duplicate-key')raw=raw.replace('"schemaVersion": 1,','"schemaVersion": 1,\n  "schemaVersion": 1,');
  writeFileSync(file,raw);nativeRun('record/'+mode,/AssertionError/);
 });
 assert.equal(proof.nativeControlPreservationControls.length,17,'Every new sealed source, reader bootstrap and closed record refusal');
 assert.equal(proof.preservationControls.length,32);
 const proofRecord=JSON.parse(readFileSync(resolve(copy,'verification/full-native-proof-extension-v1.json'),'utf8'));
 const proofRun=(id,reason)=>{const start=proof.preservationControls.length;run('native-proof/'+id,false,false,reason);proof.nativeProofPreservationControls.push(proof.preservationControls.pop());assert.equal(proof.preservationControls.length,start);};
 for(const path of [...Object.keys(proofRecord.files),...Object.keys(proofRecord.added)])for(const mode of ['missing','changed'])mutate(path,(file,old)=>{if(mode==='missing')rmSync(file);else writeFileSync(file,Buffer.concat([old,Buffer.from('\n// deliberate native-proof source corruption\n')]));proofRun(path+'/'+mode,/Sealed native proof|Sealed native generated|Sealed native packed|ERR_MODULE_NOT_FOUND|ENOENT/);});
 mutate('verification/full-native-proof-extension-v1.json',file=>{rmSync(file);proofRun('record/missing',/ENOENT/);});
 for(const mode of ['extra-key','version','predecessor-digest','predecessor-file','missing-change','extra-addition','old-reader-as-current','duplicate-key'])mutate('verification/full-native-proof-extension-v1.json',(file,old)=>{
  const r=JSON.parse(old);if(mode==='extra-key')r.ignored=true;if(mode==='version')r.schemaVersion=2;if(mode==='predecessor-digest')r.predecessor.digest='sha256:'+'0'.repeat(64);if(mode==='predecessor-file')r.predecessor.files[0][1]='0'.repeat(64);if(mode==='missing-change')delete r.files['scripts/native-control-preservation.mjs'];if(mode==='extra-addition')r.added['scripts/fixture.mjs']='sha256:'+'0'.repeat(64);if(mode==='old-reader-as-current')r.files['scripts/native-control-preservation.mjs'].currentDigest=r.files['scripts/native-control-preservation.mjs'].predecessorDigest;
  let raw=JSON.stringify(r,null,2)+'\n';if(mode==='duplicate-key')raw=raw.replace('"schemaVersion": 1,','"schemaVersion": 1,\n  "schemaVersion": 1,');writeFileSync(file,raw);proofRun('record/'+mode,/AssertionError/);
 });
 assert.equal(proof.nativeProofPreservationControls.length,17);assert.equal(proof.nativeControlPreservationControls.length,17);assert.equal(proof.preservationControls.length,32);
 const generatedRecord=JSON.parse(readFileSync(resolve(copy,'verification/full-native-generated-extension-v1.json'),'utf8'));
 const generatedRun=(id,reason)=>{const start=proof.preservationControls.length;run('native-generated/'+id,false,false,reason);proof.nativeGeneratedPreservationControls.push(proof.preservationControls.pop());assert.equal(proof.preservationControls.length,start);};
 for(const path of [...Object.keys(generatedRecord.files),...Object.keys(generatedRecord.added)])for(const mode of ['missing','changed'])mutate(path,(file,old)=>{if(mode==='missing')rmSync(file);else writeFileSync(file,Buffer.concat([old,Buffer.from('\n// deliberate native-generated source corruption\n')]));generatedRun(path+'/'+mode,/Sealed native generated|Sealed native packed|ERR_MODULE_NOT_FOUND|ENOENT/);});
 mutate('verification/full-native-generated-extension-v1.json',file=>{rmSync(file);generatedRun('record/missing',/ENOENT/);});
 for(const mode of ['extra-key','version','predecessor-digest','predecessor-file','missing-change','extra-addition','old-reader-as-current','duplicate-key'])mutate('verification/full-native-generated-extension-v1.json',(file,old)=>{
  const r=JSON.parse(old);if(mode==='extra-key')r.ignored=true;if(mode==='version')r.schemaVersion=2;if(mode==='predecessor-digest')r.predecessor.digest='sha256:'+'0'.repeat(64);if(mode==='predecessor-file')r.predecessor.files[0][1]='0'.repeat(64);if(mode==='missing-change')delete r.files['scripts/native-proof-preservation.mjs'];if(mode==='extra-addition')r.added['scripts/fixture.mjs']='sha256:'+'0'.repeat(64);if(mode==='old-reader-as-current')r.files['scripts/native-proof-preservation.mjs'].currentDigest=r.files['scripts/native-proof-preservation.mjs'].predecessorDigest;
  let raw=JSON.stringify(r,null,2)+'\n';if(mode==='duplicate-key')raw=raw.replace('"schemaVersion": 1,','"schemaVersion": 1,\n  "schemaVersion": 1,');writeFileSync(file,raw);generatedRun('record/'+mode,/AssertionError/);
 });
 assert.equal(proof.nativeGeneratedPreservationControls.length,15);assert.equal(proof.nativeProofPreservationControls.length,17);assert.equal(proof.nativeControlPreservationControls.length,17);assert.equal(proof.preservationControls.length,32);

 const packedRecord=JSON.parse(readFileSync(resolve(copy,'verification/full-native-packed-extension-v1.json'),'utf8'));
 const packedRun=(id,reason)=>{const start=proof.preservationControls.length;run('native-packed/'+id,false,false,reason);proof.nativePackedPreservationControls.push(proof.preservationControls.pop());assert.equal(proof.preservationControls.length,start);};
 for(const path of [...Object.keys(packedRecord.files),...Object.keys(packedRecord.added)])for(const mode of ['missing','changed'])mutate(path,(file,old)=>{if(mode==='missing')rmSync(file);else writeFileSync(file,Buffer.concat([old,Buffer.from('\n// deliberate native-packed source corruption\n')]));packedRun(path+'/'+mode,/Sealed native packed|ERR_MODULE_NOT_FOUND|ENOENT/);});
 mutate('verification/full-native-packed-extension-v1.json',file=>{rmSync(file);packedRun('record/missing',/ENOENT/);});
 for(const mode of ['extra-key','version','predecessor-digest','predecessor-file','missing-change','extra-addition','old-reader-as-current','duplicate-key'])mutate('verification/full-native-packed-extension-v1.json',(file,old)=>{
  const r=JSON.parse(old);if(mode==='extra-key')r.ignored=true;if(mode==='version')r.schemaVersion=2;if(mode==='predecessor-digest')r.predecessor.digest='sha256:'+'0'.repeat(64);if(mode==='predecessor-file')r.predecessor.files[0][1]='0'.repeat(64);if(mode==='missing-change')delete r.files['scripts/native-generated-preservation.mjs'];if(mode==='extra-addition')r.added['scripts/fixture.mjs']='sha256:'+'0'.repeat(64);if(mode==='old-reader-as-current')r.files['scripts/native-generated-preservation.mjs'].currentDigest=r.files['scripts/native-generated-preservation.mjs'].predecessorDigest;
  let raw=JSON.stringify(r,null,2)+'\n';if(mode==='duplicate-key')raw=raw.replace('"schemaVersion": 1,','"schemaVersion": 1,\n  "schemaVersion": 1,');writeFileSync(file,raw);packedRun('record/'+mode,/AssertionError/);
 });
 assert.equal(proof.nativePackedPreservationControls.length,27);assert.equal(proof.nativeGeneratedPreservationControls.length,15);assert.equal(proof.nativeProofPreservationControls.length,17);assert.equal(proof.nativeControlPreservationControls.length,17);assert.equal(proof.preservationControls.length,32);
 rmSync(copy,{recursive:true});
}
let schema;
function execute(id,mode='valid'){
 const d=fullDescriptor(id),parents=d.parents.map(name=>({name,leaves:d.executions.filter(e=>e.indent===4&&e.parent===name).map(e=>e.name)}));
 if(mode==='omit-parent')parents.pop();if(mode==='extra-parent')parents.push({name:'UNKNOWN / hostile control',leaves:['UNKNOWN/leaf']});if(mode==='duplicate-parent')parents.push(parents[0]);
 if(mode==='omit-leaf')parents[0].leaves.pop();if(mode==='extra-leaf')parents[0].leaves.push('UNKNOWN/extra-leaf');if(mode==='duplicate-leaf')parents[0].leaves.push(parents[0].leaves[0]);
 const file=resolve(directory,id+'-'+mode+'.test.mjs');
 writeFileSync(file,`import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
 console.log(JSON.stringify({measurement:'full-control-large-diagnostic',structuralOnly:true,data:'x'.repeat(150000)}));
 const parents=${JSON.stringify(parents)},mode=${JSON.stringify(mode)};
 for(const [i,p] of parents.entries())await test(p.name,async t=>{for(const [j,name] of p.leaves.entries()){
 const hostile=i===0&&j===0;const options=hostile&&mode==='skip'?{skip:true}:hostile&&mode==='todo'?{todo:true}:{};
 await t.test(name,options,async()=>{if(hostile&&mode==='fail')throw Error('Actual deliberate failed leaf');if(hostile&&mode==='cancel')await new Promise(()=>{});
 assert.equal(createHash('sha256').update(name).digest('hex').length,64);});}});`,{flag:'wx'});
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',file],{cwd:root,env,encoding:'utf8',timeout:5000,maxBuffer:8*1024*1024});
 proof.nativeChildren.push({kind:'identity',suite:id,mode,source:readFileSync(file,'utf8'),status:result.status,stdout:result.stdout,stderr:result.stderr,structuralOnly:true,productQualification:false});retainNativeChild(proof.nativeChildren.at(-1),result);assert.equal(result.error,undefined);assert.equal(result.signal,null);return result;
}
const receipt=r=>['storage-full-registration-start','storage-full-registration-end'].includes(r.measurement)?encodeFullReceipt(r):r;
// A batch only serializes diagnostic controls, sequentially, through native console.
// Each exact frame binds its identity and original console bytes independently.
function collectNativeFrames(stdout,frames){
 const received=[],stem='{"measurement":"storage-native-control-';let active=null,pending='',parts=[];
 const marker=kind=>{
  const f=frames[received.length];assert(f,'No extra native frame');
  return JSON.stringify({measurement:'storage-native-control-frame',kind,id:f.id,digest:f.digest,count:f.count});
 };
 for(const line of stdout.split(/\r?\n/)){
  const comment=/^\s*# (.*)$/.exec(line);
  if(!comment){assert.equal(pending,'','No interrupted native marker');assert.equal(active,null,'No interrupted native frame');continue;}
  const part=comment[1],expected=received.length<frames.length?marker(active?'end':'start'):null;
  if(pending||(expected&&expected.startsWith(part)&&part.startsWith('{'))||part.startsWith(stem)){
   const committed=pending.startsWith(stem);pending+=part;parts.push(part);
   if(!(expected&&expected.startsWith(pending))){
    // Reporter splits can share the opening JSON/header bytes with payloads.
    // Only that ambiguous prefix can return to the independently sealed payload.
    // Once the distinct marker header is present, every byte is marker-only.
    assert(active!==null&&!committed&&!pending.startsWith(stem)&&!part.startsWith(stem),'Exact closed native marker prefix, binding and order');
    active.push(...parts);pending='';parts=[];continue;
   }
   if(pending!==expected)continue;
   pending='';parts=[];
   if(active===null)active=[];
   else{
    const f=frames[received.length];
    assert.equal(active.join(''),f.lines.join(''),'Exact native frame bytes across reporter split comments');
    assert.equal(f.count,f.lines.length);assert.equal(f.digest,hash(f.lines.join('\n')+'\n'));
    received.push(active.map(l=>'# '+l).join('\n')+'\n');active=null;
   }
  }else if(active!==null)active.push(part);
  else assert(!part.trimStart().startsWith('{'),'No unbound native marker or payload');
 }
 assert.equal(pending,'','No truncated native marker');assert.equal(active,null);assert.equal(received.length,frames.length);
 return received;
}
function nativeFrames(label,controls){
 const frames=controls.map((c,index)=>{
  const lines=c.lines??c.rows.map(r=>JSON.stringify(receipt(r)));
  return {id:hash(JSON.stringify({candidate:candidate.digest,label,index,name:c.name})),name:c.name,
   digest:hash(lines.join('\n')+'\n'),count:lines.length,lines};
 });
 const file=resolve(directory,label+'-receipt-controls.test.mjs');
 writeFileSync(file,`import test from 'node:test';const frames=${JSON.stringify(frames)};
 await test('Native nonqualifying receipt controls',()=>{for(const f of frames){
 const {lines,name,...binding}=f;
 console.log(JSON.stringify({measurement:'storage-native-control-frame',kind:'start',...binding}));
 for(const line of lines)console.log(line);
 console.log(JSON.stringify({measurement:'storage-native-control-frame',kind:'end',...binding}));
 }});`,{flag:'wx'});
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',file],{cwd:root,env,encoding:'utf8',timeout:15000,maxBuffer:128*1024*1024});
 proof.nativeChildren.push({kind:'receipts',label,source:readFileSync(file,'utf8'),status:result.status,stdout:result.stdout,stderr:result.stderr,structuralOnly:true,productQualification:false});retainNativeChild(proof.nativeChildren.at(-1),result);
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0);
 return collectNativeFrames(result.stdout,frames);
}
function nativeMarkerFacilities(){
 const payload=Array.from({length:66},(_,i)=>JSON.stringify(encodeFullReceipt({measurement:'storage-full-registration-start',binding:{structuralOnly:true,productQualification:false,i,data:'中文🧪 quote " hash # backslash \\'}})));
 const binding=i=>({id:hash('native-marker-'+i),digest:hash(payload.join('\n')+'\n'),count:payload.length,lines:payload});
 const text=(f,kind)=>JSON.stringify({measurement:'storage-native-control-frame',kind,id:f.id,digest:f.digest,count:f.count});
 const samples=[];
 for(const kind of ['start','end'])for(let cut=1;cut<text(binding(0),kind).length;cut++)samples.push({kind,cut,...binding(samples.length)});
 const file=resolve(directory,'marker-boundaries.test.mjs');
 writeFileSync(file,`import test from 'node:test';const samples=${JSON.stringify(samples)};
 await test('Native nonqualifying marker boundaries',()=>{for(const f of samples){for(const kind of ['start','end']){
 const s=JSON.stringify({measurement:'storage-native-control-frame',kind,id:f.id,digest:f.digest,count:f.count});
 if(f.kind===kind){console.log(s.slice(0,f.cut));console.log(s.slice(f.cut));}else console.log(s);
 if(kind==='start')for(const line of f.lines)console.log(line);
 }}});`,{flag:'wx'});
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',file],{cwd:root,env,encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024});
 proof.nativeChildren.push({kind:'marker-boundaries',source:readFileSync(file,'utf8'),status:result.status,stdout:result.stdout,stderr:result.stderr,structuralOnly:true,productQualification:false});retainNativeChild(proof.nativeChildren.at(-1),result);
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0);
 const received=collectNativeFrames(result.stdout,samples);assert.equal(received.length,samples.length);
 assert(samples.some(f=>f.kind==='end'&&f.cut===172&&text(f,'end').length===232),'Retained 172+60 end-marker boundary');
 proof.positives.push({facility:'every-start-and-end-marker-byte-boundary',frames:samples.length,nativeFrame:hash(result.stdout),structuralOnly:true,productQualification:false});
 const f=binding(0),start=text(f,'start'),end=text(f,'end'),other=binding(1);
 const cases=[],reject=(name,lines)=>cases.push({name,lines});
 for(const kind of ['start','end']){
  const good=kind==='start'?start:end;
  const change=(name,edit)=>{const v=JSON.parse(good);edit(v);const s=JSON.stringify(v);reject(kind+':'+name,kind==='start'?[s,...payload,end]:[start,...payload,s]);};
  for(const key of ['measurement','kind','id','digest','count'])change('missing-'+key,v=>delete v[key]);
  change('unknown-header',v=>v.measurement='storage-native-control-unknown');change('wrong-role',v=>v.kind=kind==='start'?'end':'start');
  change('identity-swap',v=>v.id=other.id);change('digest-swap',v=>v.digest=hash('other'));change('count-swap',v=>v.count++);change('extra-key',v=>v.extra=true);
  const wrap=s=>kind==='start'?[s,...payload,end]:[start,...payload,s];
  reject(kind+':duplicate-key',wrap(good.replace('{','{"count":0,')));reject(kind+':noncanonical',wrap(good+' '));
  reject(kind+':truncated',wrap(good.slice(0,-1)));
  reject(kind+':corrupt-fragment',wrap(good.slice(0,172)+'!'+good.slice(173)));
 }
 reject('duplicate-start',[start,start,...payload,end]);reject('duplicate-end',[start,...payload,end,end]);
 reject('interleaved-start',[start,...payload.slice(0,1),text(other,'start'),...payload.slice(1),end]);
 reject('missing-end',[start,...payload]);reject('missing-start',[...payload,end]);
 reject('extra-frame',[start,...payload,end,start,...payload,end]);reject('payload-missing',[start,...payload.slice(1),end]);
 reject('unbound-indented-marker',[start,...payload,end,' '+end]);
 reject('payload-corrupt',[start,...payload.slice(0,-1),'corrupt',end]);
 reject('pending-end-next-start',[start,...payload,end.slice(0,172),text(other,'start')]);
 for(const c of cases){
  const child=resolve(directory,'marker-'+c.name.replaceAll(':','-')+'.test.mjs');
  writeFileSync(child,`import test from 'node:test';await test('Native hostile marker',()=>{for(const line of ${JSON.stringify(c.lines)})console.log(line);});`,{flag:'wx'});
  const r=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',child],{cwd:root,env,encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
  proof.nativeChildren.push({kind:'marker-hostile',name:c.name,source:readFileSync(child,'utf8'),status:r.status,stdout:r.stdout,stderr:r.stderr,structuralOnly:true,productQualification:false});retainNativeChild(proof.nativeChildren.at(-1),r);
  assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,0);
  assert.throws(()=>collectNativeFrames(r.stdout,[f]),c.name);
  proof.markerControls.push({name:c.name,nativeFrame:hash(r.stdout),structuralOnly:true,productQualification:false});
 }
 assert.equal(proof.markerControls.length,40,'Closed native marker hostility');
}
function envelopeLines(stdout){
 const lines=[];let pending='';
 for(const line of stdout.split(/\r?\n/)){
  const c=/^\s*# (.*)$/.exec(line);if(!c){assert.equal(pending,'');continue;}
  if(!pending&&!c[1].startsWith('{'))continue;pending+=c[1];
  let v;try{v=JSON.parse(pending);}catch{continue;}
  assert.equal(JSON.stringify(v),pending,'Canonical native control envelope');lines.push(v);pending='';
 }
 assert.equal(pending,'');return lines;
}

// Only this structural diagnostic batch uses the closed test-control transport.
// IDs and original bytes are declared before native serialization; the decoder
// consumes the actual collected envelopes and compares their decoded originals.
function nativeDiagnosticFrames(label,controls){
 const declarations=controls.map((c,index)=>({id:hash(JSON.stringify({candidate:candidate.digest,label,index,name:c.name})),lines:[...c.lines]}));
 const transport=controls.map((c,index)=>({name:c.name,lines:encodeNativeControlPayload(declarations[index].lines,declarations[index].id)}));
 const received=nativeFrames(label,transport);
 proof.controlPayloadSources={'scripts/check-full-predecessor-composition.mjs':hash(readFileSync(resolve(cwd,'scripts/check-full-predecessor-composition.mjs'))),'scripts/native-control-payload.mjs':hash(readFileSync(resolve(cwd,'scripts/native-control-payload.mjs')))};
 return received.map((stream,index)=>{
  const d=declarations[index],lines=decodeNativeControlPayload(envelopeLines(stream).map(v=>JSON.stringify(v)),d.id,d.lines);
  assert.deepEqual(lines,d.lines,'Received diagnostic controls retain every original byte');
  return lines.map(l=>'# '+l).join('\n')+'\n';
 });
}
function nativeControlPayloadFacilities(){
 const raw=diagnosticProbes().find(p=>p.name==='raw-diagnostic-refused').line;
 assert.equal(Buffer.byteLength(raw),158);
 const originals=[raw,'quote " hash # Unicode 中文🧪 backslash \\ newline\n'+'x'.repeat(160000),'final original line'];
 const frameId=hash('closed-native-control-payload-facilities'),good=encodeNativeControlPayload(originals,frameId);
 const controls=[{name:'exact-raw158-multiple-lines-160KB-native-splits',lines:good}];
 const bad=(name,edit)=>{const lines=[...good],v=JSON.parse(lines[0]);edit(v);lines[0]=JSON.stringify(v);controls.push({name,lines});};
 bad('unknown-header',v=>v.measurement='unknown');bad('unknown-version',v=>v.version=2);
 for(const key of Object.keys(JSON.parse(good[0])))bad('missing-'+key,v=>delete v[key]);
 bad('extra-key',v=>v.extra=true);bad('frame-substitution',v=>v.frameId=hash('other'));
 for(const ordinal of [-1,.5,'0',null,1])bad('ordinal-'+JSON.stringify(ordinal),v=>v.ordinal=ordinal);
 bad('product-qualification',v=>v.productQualification=true);bad('structural-only',v=>v.structuralOnly=false);
 for(const count of [0,-1,.5,'158',null,32*1024*1024+1])bad('count-'+JSON.stringify(count),v=>v.count=count);
 bad('count-too-small',v=>v.count--);bad('count-too-large',v=>v.count++);
 bad('digest-mismatch',v=>v.digest=hash('other'));bad('digest-type',v=>v.digest=null);bad('digest-format',v=>v.digest='invalid');
 bad('data-type',v=>v.data={});bad('base64-whitespace',v=>v.data+=' ');bad('base64-padding',v=>v.data+='=');
 bad('base64-truncation',v=>v.data=v.data.slice(0,-4));bad('base64-corruption',v=>v.data='!'+v.data.slice(1));bad('base64-url',v=>v.data='_'+v.data.slice(1));
 const bytes=(v,b)=>{v.data=b.toString('base64');v.count=b.length;v.digest=hash(b);};
 bad('base64-pad-bits',v=>{bytes(v,Buffer.from('a'));v.data='YR==';});
 for(const [name,b] of [['stray',[0x80]],['overlong',[0xc0,0xaf]],['surrogate',[0xed,0xa0,0x80]],['above-max',[0xf4,0x90,0x80,0x80]],['truncated',[0xe2,0x82]],['continuation',[0xe2,0x28,0xa1]]])bad('utf8-'+name,v=>bytes(v,Buffer.from(b)));
 bad('consistent-original-substitution',v=>bytes(v,Buffer.from('valid UTF8 but not the independently declared original')));
 const rawBad=(name,edit)=>{const lines=[...good];edit(lines);controls.push({name,lines});};
 rawBad('duplicate-key',l=>l[0]=l[0].replace('{','{"version":0,'));rawBad('noncanonical',l=>l[0]+=' ');
 rawBad('truncated-envelope',l=>l[0]=l[0].slice(0,-1));rawBad('missing-line',l=>l.pop());rawBad('extra-line',l=>l.push(l[0]));
 rawBad('duplicated-line',l=>l[1]=l[0]);rawBad('reordered-lines',l=>[l[0],l[1]]=[l[1],l[0]]);
 for(const value of ['[]','null','"string"'])rawBad('nonobject-'+value,l=>l[0]=value);
 const received=nativeFrames('closed-control-payload-facilities',controls);
 const decode=stream=>decodeNativeControlPayload(envelopeLines(stream).map(v=>JSON.stringify(v)),frameId,originals);
 assert.deepEqual(decode(received[0]),originals);
 const bytesReceived=Buffer.from(received[0]),chunks=[];for(let i=0;i<bytesReceived.length;i+=8191)chunks.push(bytesReceived.subarray(i,i+8191));
 assert.deepEqual(decode(Buffer.concat(chunks).toString('utf8')),originals);
 // The unchanged product admission still sees and refuses the literal raw SQL.
 const decoded=decode(received[0]);assert.equal(decoded[0],raw);
 assert.throws(()=>validateFullObservations('# '+decoded[0]+'\n','lifecycle-propagation',{suite:'lifecycle-propagation'},null),/Raw SQL diagnostic refused/);
 for(let i=1;i<controls.length;i++){
  assert.throws(()=>decode(received[i]),controls[i].name);
  proof.controlPayloadControls.push({name:controls[i].name,nativeFrame:hash(received[i]),structuralOnly:true,productQualification:false});
 }
 assert.equal(proof.controlPayloadControls.length,55,'Closed native control payload hostility');
 proof.positives.push({facility:controls[0].name,rawBytes:158,lines:originals.length,largeBytes:Buffer.byteLength(originals[1]),splitChunks:chunks.length,nativeFrame:hash(received[0]),rawSqlAdmissionRefused:true,structuralOnly:true,productQualification:false});
}

function diagnosticProbes(){
const value={measurement:'maintenance-sql-diagnostic',code:'P0002',message:'budget exhausted',where:'PL/pgSQL function\nSQL statement "SELECT \\ # 中文🧪"'};
const raw=JSON.stringify(value),good=encodeFullDiagnostic(raw),probes=[{name:'original-escaped-sql',line:JSON.stringify(good),raw}];
const large=JSON.stringify({...value,message:'quote " backslash \\ hash # newline\n 中文🧪 '+ 'x'.repeat(160000)});
probes.push({name:'160KB-native-comment-boundaries',line:JSON.stringify(encodeFullDiagnostic(large)),raw:large});
const bad=(name,edit)=>{const v=structuredClone(good);edit(v);probes.push({name,line:JSON.stringify(v)});};
bad('unknown-header',v=>v.measurement='storage-full-unknown-diagnostic');bad('unknown-version',v=>v.version=2);
bad('qualifying-substitution',v=>v.productQualification=true);bad('diagnostic-only-substitution',v=>v.diagnosticOnly=false);
for(const key of Object.keys(good))bad('missing-envelope-'+key,v=>delete v[key]);
bad('extra-envelope-key',v=>v.extra=true);
for(const count of [0,-1,0.5,'1',null,32*1024*1024+1])bad('invalid-count-'+JSON.stringify(count),v=>v.count=count);
bad('count-too-small',v=>v.count--);bad('count-too-large',v=>v.count++);
bad('digest-mismatch',v=>v.digest='sha256:'+'0'.repeat(64));bad('invalid-digest',v=>v.digest='unknown');bad('digest-type',v=>v.digest=null);
bad('data-type',v=>v.data={});bad('base64-whitespace',v=>v.data+=' ');bad('base64-padding',v=>v.data+='=');
bad('base64-truncated',v=>v.data=v.data.slice(0,-4));bad('base64-corrupt',v=>v.data='!'+v.data.slice(1));bad('base64-url',v=>v.data='_'+v.data.slice(1));
const bytes=(v,b)=>{v.data=b.toString('base64');v.count=b.length;v.digest=hash(b);};
bad('base64-noncanonical-pad-bits',v=>{bytes(v,Buffer.from('a'));v.data='YR==';});
for(const [name,b] of [['stray',[0x80]],['overlong',[0xc0,0xaf]],['surrogate',[0xed,0xa0,0x80]],['above-max',[0xf4,0x90,0x80,0x80]],['truncated',[0xe2,0x82]],['continuation',[0xe2,0x28,0xa1]]])bad('utf8-'+name,v=>bytes(v,Buffer.from(b)));
for(const key of Object.keys(value))bad('missing-payload-'+key,v=>{const p=structuredClone(value);delete p[key];bytes(v,Buffer.from(JSON.stringify(p)));});
bad('extra-payload-key',v=>bytes(v,Buffer.from(JSON.stringify({...value,extra:true}))));
for(const measurement of ['storage-observations','storage-full-receipt','storage-full-registration-start','storage-full-registration-end','unknown'])bad('payload-'+measurement,v=>bytes(v,Buffer.from(JSON.stringify({...value,measurement}))));
for(const key of ['code','message','where'])bad('payload-type-'+key,v=>bytes(v,Buffer.from(JSON.stringify({...value,[key]:{data:'hostile'}}))));
bad('invalid-sqlstate',v=>bytes(v,Buffer.from(JSON.stringify({...value,code:'arbitrary'}))));
bad('payload-lone-surrogate',v=>bytes(v,Buffer.from(JSON.stringify({...value,message:'\ud800'}))));
bad('duplicate-payload-key',v=>bytes(v,Buffer.from(raw.replace('{','{"code":"ignored",'))));
bad('noncanonical-payload',v=>bytes(v,Buffer.from(raw+' ')));
bad('nonjson-data',v=>bytes(v,Buffer.from('arbitrary hostile bytes')));
bad('payload-array',v=>bytes(v,Buffer.from('[]')));bad('payload-null',v=>bytes(v,Buffer.from('null')));
probes.push({name:'duplicate-envelope-key',line:JSON.stringify(good).replace('{','{"version":0,')});
probes.push({name:'truncated-envelope',line:JSON.stringify(good).slice(0,-1)});
probes.push({name:'raw-diagnostic-refused',line:raw});
 return probes;
}
function transportFacilities(){
 const raw=JSON.stringify({quote:'"',backslash:'\\',hash:'#',unicode:'中文🧪',newline:'\n',large:'x'.repeat(160000)});
 const value={measurement:'storage-full-registration-end',binding:{structuralOnly:true,productQualification:false},raw,rawDigest:hash(raw),fixtures:[],cleanup:[]};
 const good=encodeFullReceipt(value),controls=[{name:'quote-backslash-hash-unicode-newline-160KB-split',lines:[JSON.stringify(good)]}];
 const bad=(name,edit)=>{const v=structuredClone(good);edit(v);controls.push({name,lines:[JSON.stringify(v)]});};
 bad('unknown-header',v=>v.measurement='storage-full-unknown');bad('unknown-version',v=>v.version=2);
 for(const key of Object.keys(good))bad('missing-'+key,v=>delete v[key]);
 bad('extra-key',v=>v.extra=true);bad('wrong-role',v=>v.role='start');bad('unknown-role',v=>v.role='unknown');
 bad('count-too-small',v=>v.count--);bad('count-too-large',v=>v.count++);bad('count-fractional',v=>v.count=.5);bad('count-string',v=>v.count=String(v.count));
 bad('bad-digest',v=>v.digest='sha256:'+'0'.repeat(64));bad('malformed-digest',v=>v.digest='unknown');
 bad('truncated-base64',v=>v.data=v.data.slice(0,-4));bad('corrupt-base64',v=>v.data='!'+v.data.slice(1));
 bad('base64-whitespace',v=>v.data+=' ');bad('base64-url-alphabet',v=>v.data='_'+v.data.slice(1));bad('base64-extra-padding',v=>v.data+='=');
 const replaceBytes=(v,bytes)=>{v.data=bytes.toString('base64');v.count=bytes.length;v.digest=hash(bytes);};
 const hostileBytes=[['utf8-stray-continuation',[0x80]],['utf8-overlong',[0xc0,0xaf]],['utf8-surrogate',[0xed,0xa0,0x80]],['utf8-above-max',[0xf4,0x90,0x80,0x80]],['utf8-truncated',[0xe2,0x82]],['utf8-invalid-continuation',[0xe2,0x28,0xa1]]];
 for(const [name,bytes] of hostileBytes)bad(name,v=>replaceBytes(v,Buffer.from(bytes)));
 bad('noncanonical-base64-pad-bits',v=>{replaceBytes(v,Buffer.from('a'));v.data='YR==';});
 for(const [name,edit] of [ ['payload-extra',v=>v.extra=true],['payload-missing',v=>delete v.raw],['payload-role',v=>v.measurement='storage-full-registration-start'] ])bad(name,v=>{const p=structuredClone(value);edit(p);replaceBytes(v,Buffer.from(JSON.stringify(p)));});
 bad('duplicate-payload-key',v=>replaceBytes(v,Buffer.from(JSON.stringify(value).replace('{','{"measurement":"ignored",'))));
 controls.push({name:'duplicate-envelope-key',lines:[JSON.stringify(good).replace('{','{"version":0,')]});
 controls.push({name:'truncated-envelope',lines:[JSON.stringify(good).slice(0,-1)]});
 controls.push({name:'raw-legacy-receipt',lines:[JSON.stringify({measurement:'storage-full-registration-start',binding:{}})]});
 const received=nativeFrames('transport-facilities',controls);
 const accepted=decodeFullReceipt(envelopeLines(received[0])[0]);assert.deepEqual(accepted.value,value);assert.equal(accepted.value.raw,raw);
 // Same actual native stream, split across 8191-byte boundaries, preserves all bytes.
 const bytes=Buffer.from(received[0]);const split=[];for(let i=0;i<bytes.length;i+=8191)split.push(bytes.subarray(i,i+8191));
 assert.deepEqual(decodeFullReceipt(envelopeLines(Buffer.concat(split).toString('utf8'))[0]).value,value);
 for(let i=1;i<controls.length;i++){
  assert.throws(()=>decodeFullReceipt(envelopeLines(received[i])[0]),controls[i].name);
  proof.transportControls.push({name:controls[i].name,nativeFrame:hash(received[i]),structuralOnly:true,productQualification:false});
 }
 proof.positives.push({facility:controls[0].name,bytes:good.count,splitChunks:split.length,nativeFrame:hash(received[0]),structuralOnly:true,productQualification:false});
}
async function nativeProofFacilities(){
 const binding={candidate,sources:{'scripts/check-full-predecessor-composition.mjs':hash(readFileSync(resolve(cwd,'scripts/check-full-predecessor-composition.mjs'))),'scripts/native-proof-transport.mjs':hash(readFileSync(resolve(cwd,'scripts/native-proof-transport.mjs')))}};
 proof.nativeProofSources=binding;
 const original={measurement:'storage-hostile-full-composition',structuralOnly:true,productQualification:false,candidate,nativeProofSources:binding,nativeChildren:[{source:'中文🧪 quote " hash # backslash \\ newline\n'+Array.from({length:4096},(_,i)=>hash('long-proof-'+i)).join(''),stdout:'full stdout\n',stderr:'full stderr\n'}],failureEvidence:[{message:'retained deliberate failed control',status:1}]};
 const good=encodeNativeProof(original,binding),rows=good.wire.toString('utf8').trimEnd().split('\n').map(s=>JSON.parse(s));assert(rows.length>3,'Actual multi-chunk proof');
 const controls=[{name:'complete-original-native-bytes',wire:good.wire}];
 const bad=(name,edit)=>{const r=structuredClone(rows);edit(r);controls.push({name,wire:Buffer.from(r.map(v=>JSON.stringify(v)+'\n').join(''))});};
 for(const [name,key,value] of [['header','measurement','unknown'],['version','version',2],['raw-count','bytes',rows[0].bytes-1],['raw-digest','digest','sha256:'+'0'.repeat(64)],['compressed-count','compressedBytes',rows[0].compressedBytes-1],['compressed-digest','compressedDigest','sha256:'+'0'.repeat(64)],['raw-oversize','bytes',nativeProofLimits.raw+1],['compressed-oversize','compressedBytes',nativeProofLimits.compressed+1],['zero-count','count',0],['fraction-count','count',1.5],['structural-flag','structuralOnly',false],['product-flag','productQualification',true]])bad(name,r=>{r[0][key]=value;r[r.length-1][key]=value;});
 bad('candidate-binding',r=>{r[0].binding.candidate.digest='sha256:'+'0'.repeat(64);r[r.length-1].binding=r[0].binding;});
 for(const source of Object.keys(binding.sources))bad('source-binding/'+source,r=>{r[0].binding.sources[source]='sha256:'+'0'.repeat(64);r[r.length-1].binding=r[0].binding;});
 for(const mode of ['extra','missing'])bad('header-key/'+mode,r=>{if(mode==='extra')r[0].ignored=true;else delete r[0].version;});
 for(const mode of ['extra','missing'])bad('chunk-key/'+mode,r=>{if(mode==='extra')r[1].ignored=true;else delete r[1].index;});
 bad('chunk-header',r=>r[1].measurement='unknown');bad('chunk-version',r=>r[1].version=2);bad('chunk-kind',r=>r[1].kind='final');bad('chunk-digest',r=>r[1].digest='sha256:'+'0'.repeat(64));bad('chunk-ordinal',r=>r[1].index=1);bad('chunk-count',r=>r[1].count++);
 bad('duplicate-chunk',r=>r.splice(1,0,r[1]));bad('missing-chunk',r=>r.splice(1,1));bad('reordered-chunks',r=>[r[1],r[2]]=[r[2],r[1]]);bad('extra-chunk',r=>r.splice(-1,0,r[1]));bad('absent-final',r=>r.pop());bad('mismatched-final',r=>r.at(-1).bytes++);bad('unknown-final',r=>r.at(-1).ignored=true);bad('final-role',r=>r.at(-1).kind='start');
 for(const [name,data] of [['base64-invalid','*'],['base64-padding',rows[1].data+'='],['base64-whitespace',rows[1].data+' '],['base64-truncated',rows[1].data.slice(0,-4)]])bad(name,r=>r[1].data=data);
 const rawBad=(name,wire)=>controls.push({name,wire});rawBad('duplicate-json-key',Buffer.from(good.wire.toString().replace('{','{"version":0,')));rawBad('noncanonical-json',Buffer.from(' '+good.wire));rawBad('missing-newline',good.wire.subarray(0,-1));rawBad('invalid-wire-UTF8',Buffer.concat([Buffer.from([0xff]),good.wire]));rawBad('truncated-json',good.wire.subarray(0,-4));
 // Self-consistent hostile compression metadata reaches the actual decompressor
 // and raw parser, instead of failing an earlier digest comparison.
 const replacement=(name,raw,compressed=gzipSync(raw))=>{
  const count=Math.ceil(compressed.length/8192),first={...rows[0],bytes:raw.length,digest:hash(raw),compressedBytes:compressed.length,compressedDigest:hash(compressed),count};
  const r=[first];for(let index=0;index<count;index++)r.push({...rows[1],digest:first.digest,index,count,data:compressed.subarray(index*8192,(index+1)*8192).toString('base64')});r.push({...first,kind:'final'});rawBad(name,Buffer.from(r.map(v=>JSON.stringify(v)+'\n').join('')));
 };
 const compressed=decodeNativeProof(good.wire,binding,good.raw).compressed;
 replacement('corrupt-gzip',good.raw,Buffer.concat([Buffer.from([0]),compressed.subarray(1)]));replacement('truncated-gzip',good.raw,compressed.subarray(0,-8));replacement('trailing-gzip',good.raw,Buffer.concat([compressed,Buffer.from([0])]));replacement('concatenated-gzip',Buffer.concat([good.raw,good.raw]),Buffer.concat([compressed,compressed]));
 replacement('raw-invalid-UTF8',Buffer.from([0xff]));replacement('raw-duplicate-key',Buffer.from(good.raw.toString().replace('{','{"structuralOnly":false,')));replacement('raw-noncanonical',Buffer.from(' '+good.raw));replacement('raw-product-pass',Buffer.from(JSON.stringify({...original,productQualification:true})));replacement('raw-wrong-candidate',Buffer.from(JSON.stringify({...original,candidate:{...candidate,digest:'sha256:'+'0'.repeat(64)}})));
 bad('decompression-expansion',r=>{r[0].bytes=1;r[r.length-1].bytes=1;});
 const received=nativeFrames('native-proof-transport',controls.map(c=>({name:c.name,lines:[JSON.stringify({measurement:'storage-native-proof-control-bytes',data:c.wire.toString('base64')})]})));
 for(let i=0;i<received.length;i++){
  const v=envelopeLines(received[i])[0];assert.deepEqual(Object.keys(v),['measurement','data']);assert.equal(v.measurement,'storage-native-proof-control-bytes');const wire=Buffer.from(v.data,'base64');assert.equal(wire.toString('base64'),v.data);assert(wire.equals(controls[i].wire),'Actual native received wire equals independent declaration');
  if(i===0)assert(decodeNativeProof(wire,binding,good.raw).raw.equals(good.raw));else{assert.throws(()=>decodeNativeProof(wire,binding,good.raw),controls[i].name);proof.nativeProofControls.push({name:controls[i].name,nativeFrame:hash(received[i]),structuralOnly:true,productQualification:false});}
 }
 // Exercise the actual awaited emitter in a fresh native child, then decode its
 // received stdout against independently constructed complete original bytes.
 const module=pathToFileURL(resolve(cwd,'scripts/native-proof-transport.mjs')).href;
 const source=`import {emitNativeProof} from ${JSON.stringify(module)};await emitNativeProof(${JSON.stringify(original)},${JSON.stringify(binding)});`;
 const executeSource=(id,source,accepted)=>{
  const file=resolve(directory,id+'.mjs');writeFileSync(file,source,{flag:'wx'});const r=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
  proof.nativeChildren.push({kind:'native-proof-output',id,source:readFileSync(file,'utf8'),status:r.status,stdout:r.stdout,stderr:r.stderr,structuralOnly:true,productQualification:false});retainNativeChild(proof.nativeChildren.at(-1),r);assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,accepted?0:1,r.stderr);return r;
 };
 const actual=executeSource('actual-long-proof-emitter',source,true);decodeNativeProof(Buffer.from(actual.stdout),binding,good.raw);
 const outputFailure=executeSource('failed-proof-output',`import {Writable} from 'node:stream';import {emitNativeProof} from ${JSON.stringify(module)};const out=new Writable({write(b,e,cb){cb(new Error('deliberate-native-proof-output-failure'));}});await emitNativeProof(${JSON.stringify({...original,nativeChildren:[]})},${JSON.stringify(binding)},out,out);`,false);assert.match(outputFailure.stderr,/deliberate-native-proof-output-failure/);
 const drain=executeSource('awaited-proof-output',`import assert from 'node:assert/strict';import {Writable} from 'node:stream';import {emitNativeProof,decodeNativeProof} from ${JSON.stringify(module)};const binding=${JSON.stringify(binding)},original=${JSON.stringify(original)},parts=[];let callbacks=0,outDrains=0,errDrains=0;const out=new Writable({write(b,e,cb){if(!b.length)outDrains++;else parts.push(Buffer.from(b));setImmediate(()=>{callbacks++;cb();});}}),err=new Writable({write(b,e,cb){assert.equal(b.length,0);errDrains++;setImmediate(()=>{callbacks++;cb();});}});let settled=false;const promise=emitNativeProof(original,binding,out,err).then(()=>{settled=true;});assert.equal(settled,false);assert.equal(callbacks,0);await promise;assert.equal(settled,true);assert.equal(outDrains,1);assert.equal(errDrains,1);decodeNativeProof(Buffer.concat(parts),binding,Buffer.from(JSON.stringify(original)));console.log('actual-proof-callbacks-and-both-drains-complete');`,true);assert.match(drain.stdout,/actual-proof-callbacks-and-both-drains-complete/);
 const oversized=executeSource('wire-oversize-before-parser',`import assert from 'node:assert/strict';import {decodeNativeProof,nativeProofLimits} from ${JSON.stringify(module)};assert.throws(()=>decodeNativeProof(Buffer.alloc(nativeProofLimits.wire+1),${JSON.stringify(binding)}),/Proof wire bound/);console.log('actual-native-wire-oversize-refused');`,true);assert.match(oversized.stdout,/actual-native-wire-oversize-refused/);proof.nativeProofControls.push({name:'wire-oversize-before-parser',structuralOnly:true,productQualification:false});
 for(const failed of ['stdout','stderr']){
  const r=executeSource('failed-'+failed+'-drain',`import assert from 'node:assert/strict';import {Writable} from 'node:stream';import {emitNativeProof} from ${JSON.stringify(module)};let outDrains=0,errDrains=0;const failed=${JSON.stringify(failed)},out=new Writable({write(b,e,cb){if(!b.length){outDrains++;if(failed==='stdout')return cb(new Error('deliberate-stdout-drain-failure'));}cb();}}),err=new Writable({write(b,e,cb){errDrains++;cb(failed==='stderr'?new Error('deliberate-stderr-drain-failure'):undefined);}});await assert.rejects(emitNativeProof(${JSON.stringify({...original,nativeChildren:[]})},${JSON.stringify(binding)},out,err),/Measurement output drain failed/);assert.equal(outDrains,1);assert.equal(errDrains,1);console.log('both-native-drains-attempted-and-failure-refused');`,true);assert.match(r.stdout,/both-native-drains-attempted-and-failure-refused/);proof.nativeProofControls.push({name:'failed-'+failed+'-drain',structuralOnly:true,productQualification:false});
 }
 const thrown=executeSource('thrown-proof-write',`import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {emitNativeProof} from ${JSON.stringify(module)};const out=new EventEmitter();out.write=()=>{throw new Error('deliberate-thrown-native-write');};await assert.rejects(emitNativeProof(${JSON.stringify({...original,nativeChildren:[]})},${JSON.stringify(binding)},out,out),/deliberate-thrown-native-write/);console.log('thrown-native-write-refused');`,true);assert.match(thrown.stdout,/thrown-native-write-refused/);proof.nativeProofControls.push({name:'thrown-native-write',structuralOnly:true,productQualification:false});
 assert.throws(()=>decodeNativeProof(good.wire,binding,Buffer.from('{}')),/Exact complete independent proof bytes/);proof.nativeProofControls.push({name:'independent-raw-mismatch',structuralOnly:true,productQualification:false});
 assert.equal(proof.nativeProofControls.length,57,'Every bounded native proof transport refusal and failed output control');
 proof.positives.push({facility:'complete-native-proof-transport',controls:proof.nativeProofControls.length,rawBytes:good.raw.length,wireBytes:good.wire.length,actualEmitterDigest:hash(actual.stdout),failedOutputRefused:true,awaitedBothDrains:true,structuralOnly:true,productQualification:false});
}

async function nativePackedProofFacilities(){
 const pack=packNativeProofBytes,unpack=unpackNativeProofBytes,limits=nativeDictionaryLimits,encode=encodePackedNativeProof,decode=decodePackedNativeProof,refused=[],positives=[],children=[];
 const paths=['scripts/check-full-predecessor-composition.mjs','scripts/native-proof-transport.mjs','scripts/native-proof-dictionary.mjs','scripts/native-proof-packed-transport.mjs','scripts/native-proof-retention.mjs'];
 const originalBinding={candidate,sources:Object.fromEntries(paths.slice(0,2).map(p=>[p,hash(readFileSync(resolve(cwd,p)))]))},packedBinding={candidate,sources:Object.fromEntries(paths.map(p=>[p,hash(readFileSync(resolve(cwd,p)))]))};
const original={measurement:'storage-hostile-full-composition',structuralOnly:true,productQualification:false,candidate,nativeProofSources:originalBinding,nativePackedProofSources:packedBinding,nativeChildren:[],payload:'保存🙂é\u0000\n'.repeat(50000)};
const good=encode(original,originalBinding,packedBinding);assert(decode(good.wire,originalBinding,packedBinding,good.raw).raw.equals(good.raw));
assert.equal(decodeNativeProof(good.wire,originalBinding).proof.transportOnly,true);positives.push('carrier-is-explicitly-transport-only');
const reject=(name,body)=>{assert.throws(body,name);refused.push(name);proof.nativePackedProofControls.push({name,structuralOnly:true,productQualification:false});};
const change=(name,body)=>{const x=structuredClone(good.carrier);body(x.packedProof,x);reject(name,()=>decode(encodeNativeProof(x,originalBinding).wire,originalBinding,packedBinding));};
for(const key of ['version','bytes','digest','blocks','order'])change('dictionary-missing-'+key,x=>delete x[key]);
change('dictionary-extra-key',x=>x.extra=true);
for(const value of [0,2,'1',null])change('dictionary-version-'+String(value),x=>x.version=value);
for(const value of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1,limits.raw+1,'1',null])change('dictionary-bytes-'+String(value),x=>x.bytes=value);
for(const value of ['sha256:'+'0'.repeat(64),'bad',null,7])change('dictionary-digest-'+String(value),x=>x.digest=value);
for(const key of ['blocks','order']){
 change(key+'-empty',x=>x[key]=[]);change(key+'-not-array',x=>x[key]={});change(key+'-too-many',x=>x[key]=Array(limits.entries+1).fill(key==='blocks'?'eA==':0));
}
for(const [name,value] of [['empty',''],['not-string',3],['invalid','!!!!'],['whitespace','eA==\n'],['noncanonical','eB=='],['oversized',Buffer.alloc(4097).toString('base64')]])change('block-'+name,x=>x.blocks[0]=value);
change('block-duplicate',x=>x.blocks.push(x.blocks[0]));change('block-unused',x=>x.blocks.push(Buffer.from('unused block').toString('base64')));
for(const [name,value] of [['negative',-1],['fractional',0.5],['unsafe',Number.MAX_SAFE_INTEGER+1],['out-of-range',good.carrier.packedProof.blocks.length],['string','0'],['null',null]])change('reference-'+name,x=>x.order[0]=value);
change('reference-first-use',x=>x.order[0]=1);change('reference-missing',x=>x.order.pop());change('reference-extra',x=>x.order.push(0));change('reference-reordered',x=>[x.order[0],x.order[1]]=[x.order[1],x.order[0]]);
change('expansion-before-allocation',x=>x.bytes=1);
change('declared-byte-count-mismatch',x=>x.bytes++);
// Alternate segmentation has an independently correct digest and total, yet
// must fail the canonical repack check rather than a stale outer digest.
const raw=good.raw,alternate={version:1,bytes:raw.length,digest:hash(raw),blocks:[],order:[]},seen=new Map();
for(let i=0;i<raw.length;i+=1024){const b=raw.subarray(i,i+1024).toString('base64');let j=seen.get(b);if(j===undefined){j=alternate.blocks.length;seen.set(b,j);alternate.blocks.push(b);}alternate.order.push(j);}
change('alternate-segmentation',(x,c)=>c.packedProof=alternate);
for(const key of ['measurement','structuralOnly','productQualification','candidate','nativeProofSources','transportOnly','packedProofBinding','packedProof']){
 const carrier=structuredClone(good.carrier);delete carrier[key];
 // v1 enforces its original five; the remaining three reach the packed decoder.
 reject('carrier-missing-'+key,()=>decode(encodeNativeProof(carrier,originalBinding).wire,originalBinding,packedBinding));
}
change('carrier-extra-key',(x,c)=>c.extra=true);change('carrier-transportOnly-false',(x,c)=>c.transportOnly=false);
change('carrier-facilities-source',(x,c)=>c.packedProofBinding.sources[paths[2]]=hash('wrong'));
change('carrier-facilities-missing-source',(x,c)=>delete c.packedProofBinding.sources[paths[4]]);
change('carrier-facilities-extra-source',(x,c)=>c.packedProofBinding.sources['scripts/extra.mjs']=hash('deliberate-extra-source'));
change('carrier-facilities-candidate',(x,c)=>c.packedProofBinding.candidate.digest=hash('wrong'));
reject('independent-original-candidate',()=>decode(good.wire,{...originalBinding,candidate:{...candidate,digest:hash('wrong')}},packedBinding));
reject('independent-packed-extra-key',()=>decode(good.wire,originalBinding,{...packedBinding,ignored:true}));
reject('independent-packed-original-source',()=>decode(good.wire,originalBinding,{...packedBinding,sources:{...packedBinding.sources,[paths[0]]:hash('wrong')}}));
reject('independent-original-raw-mismatch',()=>decode(good.wire,originalBinding,packedBinding,Buffer.from('{}')));
const inner=(name,edit)=>change(name,(x,c)=>{const p=structuredClone(original);edit(p);c.packedProof=pack(Buffer.from(JSON.stringify(p)));});
inner('original-candidate',p=>p.candidate.digest=hash('wrong'));
inner('original-old-source',p=>p.nativeProofSources.sources[paths[0]]=hash('wrong'));
inner('original-packed-source',p=>p.nativePackedProofSources.sources[paths[4]]=hash('wrong'));
inner('original-packed-extra-binding',p=>p.nativePackedProofSources.extra=true);
inner('original-product',p=>p.productQualification=true);inner('original-structural',p=>p.structuralOnly=false);inner('original-header',p=>p.measurement='other');inner('original-transportOnly',p=>p.transportOnly=true);
for(const [name,b] of [['invalid-utf8',Buffer.from([0xff])],['noncanonical-json',Buffer.from(JSON.stringify(original)+' ')],['duplicate-json-key',Buffer.from(JSON.stringify(original).replace('{','{"structuralOnly":true,'))],['truncated-json',raw.subarray(0,-1)],['bom-json',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),raw])]])change('original-'+name,(x,c)=>c.packedProof=pack(b));
// Unknown/missing/duplicate dictionary key bytes must also fail when received
// through a self-consistent, otherwise valid v1 gzip carrier.
function rawCarrierWire(carrierRaw){
 const frames=good.wire.toString().trimEnd().split('\n').map(JSON.parse),compressed=gzipSync(carrierRaw),header={...frames[0],bytes:carrierRaw.length,digest:hash(carrierRaw),compressedBytes:compressed.length,compressedDigest:hash(compressed),count:Math.ceil(compressed.length/8192)};
 const rows=[header];for(let index=0;index<header.count;index++)rows.push({measurement:header.measurement,version:1,kind:'chunk',digest:header.digest,index,count:header.count,data:compressed.subarray(index*8192,(index+1)*8192).toString('base64')});rows.push({...header,kind:'final'});return Buffer.from(rows.map(r=>JSON.stringify(r)+'\n').join(''));
}
const carrierText=good.carrierRaw.toString();reject('received-dictionary-duplicate-key',()=>decode(rawCarrierWire(Buffer.from(carrierText.replace('"packedProof":{"version":1,','"packedProof":{"version":1,"version":1,'))),originalBinding,packedBinding));
reject('received-wire-truncated',()=>decode(good.wire.subarray(0,-1),originalBinding,packedBinding));
for(const [name,b] of [['one-byte',Buffer.from('x')],['maximum-block',Buffer.alloc(4096,120)],['long-unicode',Buffer.from('汉字🙂é'.repeat(10000))],['non-text-bytes',Buffer.from(Array.from({length:256},(_,i)=>i))],['repeated-cross-window',Buffer.from('ababab'.repeat(100000))]]){assert(unpack(pack(b)).equals(b));positives.push(name);}
const supplemental=pack(Buffer.from('different canonical blocks '.repeat(5000)));
for(const [name,value] of [['null',null],['array',[]],['string','dictionary']])reject('dictionary-type-'+name,()=>unpack(value));
reject('dictionary-key-order',()=>unpack({bytes:supplemental.bytes,version:supplemental.version,digest:supplemental.digest,blocks:supplemental.blocks,order:supplemental.order}));
reject('block-decoded-bound',()=>unpack({...supplemental,blocks:[Buffer.alloc(4097).toString('base64')],order:[0],bytes:4097}));
reject('pack-requires-buffer',()=>pack('raw'));
reject('pack-refuses-empty',()=>pack(Buffer.alloc(0)));
reject('first-use-self-consistent-reordering',()=>{const p=structuredClone(supplemental);assert(p.blocks.length>1);[p.blocks[0],p.blocks[1]]=[p.blocks[1],p.blocks[0]];p.order=p.order.map(i=>i===0?1:i===1?0:i);unpack(p);});
reject('declared-expansion-upper-bound',()=>unpack({...supplemental,bytes:limits.raw+1}));
assert.equal(proof.nativePackedProofControls.length,90,'Every separately inventoried dictionary and packed wrapper refusal');
const module=pathToFileURL(resolve(cwd,'scripts/native-proof-packed-transport.mjs')).href,codec=pathToFileURL(resolve(cwd,'scripts/native-proof-transport.mjs')).href;
function execute(name,source,status=0){
 const file=resolve(directory,'packed-'+name+'.mjs');writeFileSync(file,source,{flag:'wx'});
 const result=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
 const child={kind:'native-packed-output',name,source:readFileSync(file,'utf8'),status:result.status,stdout:result.stdout,stderr:result.stderr,structuralOnly:true,productQualification:false};
 proof.nativeChildren.push(child);retainNativeChild(child,result);children.push(child);
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,status,result.stderr);
 proof.nativePackedOutputControls.push({name,status:result.status,sourceDigest:hash(child.source),stdoutDigest:hash(child.stdout),stderrDigest:hash(child.stderr),structuralOnly:true,productQualification:false});return child;
}
const setup=`import assert from 'node:assert/strict';import {Writable} from 'node:stream';import {encodePackedNativeProof,decodePackedNativeProof,emitPackedNativeProof} from ${JSON.stringify(module)};const original=${JSON.stringify(original)},binding=${JSON.stringify(originalBinding)},packed=${JSON.stringify(packedBinding)};`;
const actual=execute('long-actual-emitter',setup+'await emitPackedNativeProof(original,binding,packed);');assert(decode(Buffer.from(actual.stdout),originalBinding,packedBinding,good.raw).raw.equals(good.raw));
execute('awaited-callbacks',setup+`let callbacks=0,outDrains=0,errDrains=0,settled=false;const chunks=[];const out=new Writable({write(b,e,cb){if(!b.length)outDrains++;else chunks.push(Buffer.from(b));setImmediate(()=>{callbacks++;cb();});}}),err=new Writable({write(b,e,cb){assert.equal(b.length,0);errDrains++;setImmediate(()=>{callbacks++;cb();});}});const pending=emitPackedNativeProof(original,binding,packed,out,err).then(()=>settled=true);assert.equal(settled,false);assert.equal(callbacks,0);await pending;assert.equal(settled,true);assert.equal(outDrains,1);assert.equal(errDrains,1);assert(callbacks>2);decodePackedNativeProof(Buffer.concat(chunks),binding,packed,Buffer.from(JSON.stringify(original)));console.log('awaited');`);
execute('output-failure',setup+`const out=new Writable({write(b,e,cb){cb(new Error('deliberate-packed-output-failure'));}});await emitPackedNativeProof(original,binding,packed,out,out);`,1);
assert.match(children.at(-1).stderr,/deliberate-packed-output-failure/);
for(const failed of ['stdout','stderr'])execute(failed+'-drain-failure',setup+`let outDrains=0,errDrains=0;const failed=${JSON.stringify(failed)},out=new Writable({write(b,e,cb){if(!b.length){outDrains++;if(failed==='stdout')return cb(new Error('deliberate-stdout-drain'));}cb();}}),err=new Writable({write(b,e,cb){errDrains++;cb(failed==='stderr'?new Error('deliberate-stderr-drain'):undefined);}});await assert.rejects(emitPackedNativeProof(original,binding,packed,out,err),/Measurement output drain failed/);assert.equal(outDrains,1);assert.equal(errDrains,1);console.log('both-drains-attempted');`);
execute('thrown-write',setup+`const {EventEmitter}=await import('node:events');const out=new EventEmitter();out.write=()=>{throw new Error('deliberate-packed-write-throw');};await assert.rejects(emitPackedNativeProof(original,binding,packed,out,out),/deliberate-packed-write-throw/);console.log('throw-refused');`);
execute('oversize-before-parser',`import assert from 'node:assert/strict';import {decodePackedNativeProof} from ${JSON.stringify(module)};import {nativeProofLimits} from ${JSON.stringify(codec)};assert.throws(()=>decodePackedNativeProof(Buffer.alloc(nativeProofLimits.wire+1),${JSON.stringify(originalBinding)},${JSON.stringify(packedBinding)}),/Proof wire bound/);console.log('oversize-before-parser');`);
execute('source-refusal',setup+`packed.sources['scripts/native-proof-dictionary.mjs']='sha256:'+'0'.repeat(64);const good=encodePackedNativeProof(original,binding,original.nativePackedProofSources);assert.throws(()=>decodePackedNativeProof(good.wire,binding,packed),/Independent packed facilities binding/);console.log('source-refused');`);
assert.equal(proof.nativePackedOutputControls.length,8,'Every fresh packed output, callback, drain, bounds and binding child');
 proof.positives.push({facility:'complete-native-packed-proof-transport',controls:90,outputChildren:8,rawBytes:good.raw.length,wireBytes:good.wire.length,actualEmitterDigest:hash(actual.stdout),positives,structuralOnly:true,productQualification:false});
}

async function nativePackedRetentionFacilities(){
 const facilityDirectory=resolve(root,'docs/loop/agent-fabric-g1-f05-storage/native-attempts',candidate.digest.slice(7)+'-retention-controls-'+nativeAttempt.reference.attempt);
 mkdirSync(facilityDirectory,{mode:0o700});
 const base=resolve(facilityDirectory,'attempts'),source=resolve(cwd,'scripts/native-proof-retention.mjs'),sourceDigest=hash(readFileSync(source)),controls=[],children=[],refs=[],results=[];
 const paths=['scripts/check-full-predecessor-composition.mjs','scripts/native-proof-transport.mjs','scripts/native-proof-dictionary.mjs','scripts/native-proof-packed-transport.mjs','scripts/native-proof-retention.mjs'];
 const originalBinding={candidate,sources:Object.fromEntries(paths.slice(0,2).map(p=>[p,hash(readFileSync(resolve(cwd,p)))]))},packedBinding={candidate,sources:Object.fromEntries(paths.map(p=>[p,hash(readFileSync(resolve(cwd,p)))]))};
 const control=name=>{controls.push(name);proof.nativePackedRetentionControls.push({name,structuralOnly:true,productQualification:false});};
 const representationControl=row=>{results.push(row);proof.nativePackedRepresentationControls.push({...row,structuralOnly:true,productQualification:false});};
const refusal=(name,run)=>{assert.throws(run,name);control(name);};
const attempt=()=>{const r=createNativeProofAttempt(base,candidate,sourceDigest);refs.push(r.reference);return r;};
const completeChild={kind:'deliberate-retention-probe',source:'console.log("child-来源🙂");',status:0,stdout:'child-来源🙂\n',stderr:'complete stderr\n',structuralOnly:true,productQualification:false};
const record=child=>({measurement:'storage-hostile-full-composition',structuralOnly:true,productQualification:false,candidate,nativeChildren:[child],failureEvidence:[]});
const a=attempt(),b=attempt();assert.notEqual(a.reference.path,b.reference.path);assert.equal(JSON.parse(readFileSync(resolve(a.reference.path,'attempt.json'))).phase,'incomplete');control('unique-exclusive-incomplete-attempts');
a.appendChild(completeChild,{signal:null});
for(const key of ['source','stdout','stderr']){const ext=key==='source'?'mjs':'log';assert(readFileSync(resolve(a.reference.path,'child-000000-'+key+'.'+ext)).equals(Buffer.from(completeChild[key])));}
const metadata=JSON.parse(readFileSync(resolve(a.reference.path,'child-000000-metadata.json')));assert.deepEqual(Object.keys(metadata),['version','attempt','candidate','retentionSourceDigest','structuralOnly','productQualification','index','child','result','channels']);assert.deepEqual(metadata.result,{error:null,signal:null});control('complete-channels-and-closed-metadata');
refusal('mutated-child-before-proof',()=>a.recordProof(record({...completeChild,stdout:'changed'})));
const raw=a.recordProof(record(completeChild));assert(readFileSync(resolve(a.reference.path,'proof.json')).equals(raw));control('canonical-complete-proof-retained');
refusal('no-proof-overwrite',()=>a.recordProof(record(completeChild)));assert(readFileSync(resolve(a.reference.path,'proof.json')).equals(raw));
refusal('no-child-after-proof',()=>a.appendChild(completeChild));
const error=new AggregateError([new Error('original nested failure')],'original aggregate failure');a.recordFailure(error,'encode');const failed=JSON.parse(readFileSync(resolve(a.reference.path,'failure-encode.json')));assert.equal(failed.error.message,error.message);assert.equal(failed.error.errors[0].message,error.errors[0].message);assert.equal(failed.error.stack,error.stack);control('full-original-aggregate-failure-retained');
refusal('no-failure-overwrite',()=>a.recordFailure(new Error('replacement'),'encode'));assert.equal(JSON.parse(readFileSync(resolve(a.reference.path,'failure-encode.json'))).error.message,error.message);
const target=resolve(facilityDirectory,'symlink-target-v2.log');writeFileSync(target,'untouched reproducible probe target',{flag:'wx'});symlinkSync(target,resolve(b.reference.path,'child-000000-source.mjs'));refusal('symlink-child-refused',()=>b.appendChild(completeChild));assert.equal(readFileSync(target,'utf8'),'untouched reproducible probe target');assert(lstatSync(resolve(b.reference.path,'child-000000-source.mjs')).isSymbolicLink());
const parentLink=resolve(facilityDirectory,'retention-parent-link-v2');symlinkSync(base,parentLink);refusal('symlink-parent-refused',()=>createNativeProofAttempt(resolve(parentLink,'new'),candidate,sourceDigest));
const baseLink=resolve(facilityDirectory,'retention-base-link-v2');symlinkSync(base,baseLink);refusal('symlink-base-refused',()=>createNativeProofAttempt(baseLink,candidate,sourceDigest));
const c=attempt();writeFileSync(resolve(c.reference.path,'child-000000-source.mjs'),'preexisting source',{flag:'wx'});refusal('exclusive-child-no-overwrite',()=>c.appendChild(completeChild));assert.equal(readFileSync(resolve(c.reference.path,'child-000000-source.mjs'),'utf8'),'preexisting source');
const interrupted=attempt();interrupted.appendChild(completeChild,{error:Object.assign(new Error('deliberate spawn failure'),{code:'ERR_DELIBERATE'}),signal:'SIGTERM'});assert.equal(JSON.parse(readFileSync(resolve(interrupted.reference.path,'attempt.json'))).phase,'incomplete');assert.equal(readdirSync(interrupted.reference.path).includes('proof.json'),false);const m=JSON.parse(readFileSync(resolve(interrupted.reference.path,'child-000000-metadata.json')));assert.equal(m.result.signal,'SIGTERM');assert.equal(m.result.error.code,'ERR_DELIBERATE');control('interrupted-attempt-visible-with-error-and-signal');
refusal('relative-base-refused',()=>createNativeProofAttempt('relative',candidate,sourceDigest));refusal('invalid-candidate-refused',()=>createNativeProofAttempt(base,{digest:'bad',files:1132},sourceDigest));refusal('invalid-source-refused',()=>createNativeProofAttempt(base,candidate,'bad'));
const module=pathToFileURL(source).href,packedModule=pathToFileURL(resolve(cwd,'scripts/native-proof-packed-transport.mjs')).href;
for(const mode of ['assertion','encode','output']){
 const folder=resolve(facilityDirectory,'retention-children-v2',mode);mkdirSync(folder,{recursive:true});const file=resolve(folder,'source.mjs');
 const generated=`import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {Writable} from 'node:stream';import {createNativeProofAttempt} from ${JSON.stringify(module)};import {emitPackedNativeProof} from ${JSON.stringify(packedModule)};const candidate=${JSON.stringify(candidate)},attempt=createNativeProofAttempt(${JSON.stringify(base)},candidate,${JSON.stringify(sourceDigest)});console.log(JSON.stringify(attempt.reference));const code='console.log("actual retained child 来源🙂");',r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000,maxBuffer:1048576}),child={kind:'actual-retained-child',source:code,status:r.status,stdout:r.stdout,stderr:r.stderr,structuralOnly:true,productQualification:false};attempt.appendChild(child,r);const original=${JSON.stringify(originalBinding)},packed=${JSON.stringify(packedBinding)};const proof={measurement:'storage-hostile-full-composition',structuralOnly:true,productQualification:false,candidate,nativeProofSources:original,nativePackedProofSources:packed,nativeChildren:[child],failureEvidence:[]};let error;try{assert.equal(r.error,undefined);assert.equal(r.signal,null);if(${JSON.stringify(mode)}==='assertion')assert.equal(r.status,99,'deliberate-original-child-assertion');}catch(e){error=e;proof.failureEvidence=[{name:e.name,message:e.message,stack:e.stack}];}attempt.recordProof(proof);if(error){attempt.recordFailure(error,'assertion');throw new AggregateError([error],'original-retained-native-failure');}try{if(${JSON.stringify(mode)}==='encode')proof.nativePackedProofSources={...packed,candidate:{...candidate,digest:'sha256:'+'0'.repeat(64)}};const out=new Writable({write(b,e,cb){cb(new Error('deliberate-original-output-failure'));}});await emitPackedNativeProof(proof,original,packed,out,out);}catch(e){attempt.recordFailure(e,${JSON.stringify(mode)});throw new AggregateError([e],'original-retained-native-failure');}`;
 writeFileSync(file,generated,{flag:'wx'});const r=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});const nativeChild={kind:'native-packed-retention',mode,source:readFileSync(file,'utf8'),status:r.status,stdout:r.stdout,stderr:r.stderr,structuralOnly:true,productQualification:false};proof.nativeChildren.push(nativeChild);retainNativeChild(nativeChild,r);writeFileSync(resolve(folder,'stdout.log'),r.stdout??'',{flag:'wx'});writeFileSync(resolve(folder,'stderr.log'),r.stderr??'',{flag:'wx'});assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,1);assert.match(r.stderr,/AggregateError: original-retained-native-failure/);assert.match(r.stderr,mode==='assertion'?/deliberate-original-child-assertion/:mode==='encode'?/Complete packed facilities binding/:/deliberate-original-output-failure/);
 const reference=JSON.parse(r.stdout.trim()),retainedProof=JSON.parse(readFileSync(resolve(reference.path,'proof.json'))),retained=retainedProof.nativeChildren[0];assert.equal(retainedProof.nativeChildren.length,1);assert.equal(retained.status,0);assert.match(retained.stdout,/actual retained child 来源🙂/);
 for(const key of ['source','stdout','stderr'])assert(readFileSync(resolve(reference.path,'child-000000-'+key+'.'+(key==='source'?'mjs':'log'))).equals(Buffer.from(retained[key])));
 const failure=JSON.parse(readFileSync(resolve(reference.path,'failure-'+mode+'.json')));assert(failure.error.message);assert.equal(failure.phase,'proof-retained');assert.equal(readdirSync(reference.path).includes('emitted.json'),false);refs.push(reference);children.push({mode,source:generated,status:r.status,stdout:r.stdout,stderr:r.stderr,attempt:reference});control('actual-'+mode+'-retained-before-original-failure');
}
const absent=attempt(),nullChild={...completeChild,stdout:null,stderr:null};absent.appendChild(nullChild,{error:Object.assign(new Error('spawn refused before output'),{code:'EACCES'}),signal:null});const nullMetadata=JSON.parse(readFileSync(resolve(absent.reference.path,'child-000000-metadata.json')));assert.equal(nullMetadata.channels.stdout.available,false);assert.equal(nullMetadata.channels.stderr.available,false);assert.equal(nullMetadata.result.error.code,'EACCES');assert.equal(nullMetadata.channels.stdout.bytes,0);const nullRaw=absent.recordProof(record(nullChild));assert.equal(JSON.parse(nullRaw).nativeChildren[0].stdout,null);control('unavailable-streams-explicit-with-original-spawn-error');
const emitted=attempt();emitted.appendChild(completeChild);emitted.recordProof(record(completeChild));emitted.recordEmitted({bytes:123,wireBytes:456});assert.equal(JSON.parse(readFileSync(resolve(emitted.reference.path,'emitted.json'))).phase,'emitted-not-qualified');control('emitted-status-never-claims-qualification');refusal('no-emitted-overwrite',()=>emitted.recordEmitted({}));
assert.equal(controls.length,22,'Every separate durable retention control');assert.equal(children.length,3,'Every actual retention failure child');
const child={kind:'representation',source:'actual retained source',status:null,stdout:'',stderr:'',structuralOnly:true,productQualification:false};
const representationProof=c=>({measurement:'storage-hostile-full-composition',structuralOnly:true,productQualification:false,candidate,nativeChildren:[c]});
for(const [name,value] of [['empty-string',''],['null',null],['undefined',undefined]]){
 const attempt=createNativeProofAttempt(base,candidate,sourceDigest),c={...child,stdout:value,stderr:value};attempt.appendChild(c,{error:Object.assign(new Error('spawn failed'),{code:'ENOENT'}),signal:'SIGTERM'});
 const metadata=JSON.parse(readFileSync(resolve(attempt.reference.path,'child-000000-metadata.json')));
 for(const key of ['stdout','stderr']){
  assert.equal(metadata.channels[key].representation,value===null?'null':typeof value);
  assert.equal(metadata.channels[key].available,typeof value==='string');assert.equal(metadata.channels[key].bytes,0);
 }
 assert.equal(metadata.result.error.code,'ENOENT');assert.equal(metadata.result.signal,'SIGTERM');
 for(const [other,changed] of [['empty-string',''],['null',null],['undefined',undefined]])if(other!==name){
  assert.throws(()=>attempt.recordProof(representationProof({...c,stdout:changed})),/Retained original child stdout/);
  representationControl({name:name+'-to-'+other,refused:true,attempt:attempt.reference});
 }
 const raw=attempt.recordProof(representationProof(c));assert(raw.equals(Buffer.from(JSON.stringify(representationProof(c)))));
 const decoded=JSON.parse(raw);
 if(value===undefined){assert.equal(Object.hasOwn(decoded.nativeChildren[0],'stdout'),false);assert.equal(Object.hasOwn(decoded.nativeChildren[0],'stderr'),false);}
 else assert.equal(decoded.nativeChildren[0].stdout,value);
 representationControl({name,restored:true,attempt:attempt.reference});
}
for(const key of ['stdout','stderr'])for(const [name,value] of [['number',3],['boolean',false],['buffer',Buffer.from('actual bytes')],['object',{}]]){
 const attempt=createNativeProofAttempt(base,candidate,sourceDigest);
 assert.throws(()=>attempt.appendChild({...child,[key]:value}),new RegExp('Original retained child '+key));
 representationControl({name:key+'-'+name,refused:true,attempt:attempt.reference,incomplete:true});
}
assert.equal(results.filter(r=>r.refused).length,14);assert.equal(results.filter(r=>r.restored).length,3);
proof.positives.push({facility:'complete-native-packed-retention',controls:22,children:3,representationRefusals:14,representationRestores:3,structuralOnly:true,productQualification:false});
}

try{
 assertBaseline();assertCompositionPreservation({all:true});assertExecutionPreservation();assertRecoveryPins();assertManifest();
 preservationControls();
 const manifest=await import('./manifest.mjs');
 for(const [id,parents,leaves,sources] of [['lifecycle-propagation',13,174,8],['volume-draft',7,54,3]]){
  const d=fullDescriptor(id);assert.equal(d.parents.length,parents);assert.equal(d.leaves,leaves);assert.equal(d.records,sources);
  const frozen=manifest.suites[id];
  assert.deepEqual(d.parents.map(name=>name.split(' / ')[0]).filter(n=>frozen.cases.includes(n)).sort(),[...frozen.cases].sort());
  const expected=[...Object.values(frozen.variants).flat(),...d.registrations.filter(s=>s.isolate).flatMap(s=>Object.values(manifest.components[s.id].variants).flat())];
  assert.deepEqual(d.executions.filter(e=>e.indent===4).map(e=>e.name).sort(),expected.sort());
  for(const s of d.registrations)assert.deepEqual(s.positives,manifest.components[s.id].positives);
 }
 const built=spawnSync(process.execPath,[resolve(cwd,'scripts/build.mjs')],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
 process.stdout.write(built.stdout??'');process.stderr.write(built.stderr??'');assert.equal(built.error,undefined);assert.equal(built.signal,null);assert.equal(built.status,0);assert.match(built.stdout,/"measurement":"strict-build"/);
 ({QualificationObservationSchema:schema}=await import(pathToFileURL(resolve(cache,'g1-storage/src/schema.js')).href));
 const controls=JSON.parse(readFileSync(resolve(cwd,'verification/full-composition-retained-controls-v1.json'),'utf8'));assert.equal(controls.structuralControlsOnly,true);assert.equal(controls.productQualification,false);
 nativeMarkerFacilities();transportFacilities();nativeControlPayloadFacilities();await nativeProofFacilities();await nativePackedProofFacilities();await nativePackedRetentionFacilities();
 for(const id of ['lifecycle-propagation','volume-draft']){
  const valid=execute(id);const report=validateFullTap(valid,id);proof.positives.push({suite:id,tests:report.tests,parents:report.cases.length,leaves:report.variants.length,stdoutDigest:hash(valid.stdout),structuralOnly:true});
  for(const mode of ['omit-parent','extra-parent','duplicate-parent','omit-leaf','extra-leaf','duplicate-leaf','fail','cancel','skip','todo']){
   const result=execute(id,mode);assert.throws(()=>validateFullTap(result,id));proof.tapControls.push({suite:id,mode,status:result.status,stdoutDigest:hash(result.stdout)});
  }
  // Fresh actual fixture/cleanup receipts for the admission controls; the raw
  // counters remain visibly retained failing-candidate controls, never a pass.
  await withStorageFixture(async outer=>{
   const context=createFullContext(id,candidate.digest,outer.env),d=fullDescriptor(id),rows=[];
   for(const [i,spec] of d.registrations.entries()){
    const binding=registrationBinding(context,spec,i),births=[],cleanup=[];
    rows.push({measurement:'storage-full-registration-start',binding});
    const log=console.log;console.log=(...args)=>{log(...args);if(args.length!==1||typeof args[0]!=='string'||!args[0].startsWith('{'))return;const v=JSON.parse(args[0]);rows.push(v);if(v.measurement==='storage-owned-fixture')births.push(v);if(['storage-container-cleanup','storage-root-cleanup'].includes(v.measurement))cleanup.push(v);};
    try{for(let j=0;j<spec.fixtures;j++)await withStorageFixture(async state=>{
     assert.equal(state.paidCallsAllowed,false);assert.equal(state.assurance,'deterministic-local-only');
     proof.fixtures.push({suite:id,registration:spec.id,owner:state.env.STORAGE_FIXTURE_OWNER,instance:state.env.STORAGE_FIXTURE_INSTANCE});
    });}finally{console.log=log;}
    const raw=controls.suites[id][spec.id];rows.push(JSON.parse(raw));rows.push({measurement:'storage-full-registration-end',binding,raw,rawDigest:hash(raw),fixtures:births,cleanup});
   }
   const probes=[{name:'positive',rows:structuredClone(rows)}];
   const reject=(name,mutate)=>{const copy=structuredClone(rows);mutate(copy);probes.push({name,rows:copy});};
   const endIndex=rows.findIndex(r=>r.measurement==='storage-full-registration-end'),sourceIndex=endIndex-1;
   reject('missing-source',r=>r.splice(sourceIndex,1));reject('extra-source',r=>r.push(r[sourceIndex]));reject('duplicate-source',r=>r.splice(sourceIndex,0,r[sourceIndex]));
   reject('missing-origin',r=>r.splice(0,1));reject('extra-origin',r=>r.push(r[0]));reject('duplicate-origin',r=>r.splice(0,0,r[0]));
   reject('wrong-origin',r=>r[0].binding.registration='wrong');reject('wrong-order',r=>{[r[0],r[endIndex+1]]=[r[endIndex+1],r[0]];});
   reject('corrupt-source',r=>r[0].binding.sources[Object.keys(r[0].binding.sources)[0]]='sha256:'+'0'.repeat(64));
   reject('corrupt-candidate',r=>r[0].binding.candidate='sha256:'+'0'.repeat(64));
   reject('corrupt-supervisor',r=>r[0].binding.supervisor.instance='substituted');
   reject('corrupt-fixture',r=>r[endIndex].fixtures[0].instance='substituted');
   reject('corrupt-cleanup',r=>r[endIndex].cleanup[0].removed=false);
   reject('corrupt-provenance-bytes',r=>r[endIndex].raw+=' ');reject('corrupt-provenance-digest',r=>r[endIndex].rawDigest='sha256:'+'0'.repeat(64));
   // Rebind end copies consistently: these probes challenge the actual origin
   // and ownership rules rather than relying on a stale receipt copy.
   const rebind=r=>{for(const end of r.filter(v=>v.measurement==='storage-full-registration-end')){
    const a=r.findIndex(v=>v.measurement==='storage-full-registration-start'&&v.binding.ordinal===end.binding.ordinal),b=r.indexOf(end),range=r.slice(a+1,b);
    end.fixtures=range.filter(v=>v.measurement==='storage-owned-fixture');end.cleanup=range.filter(v=>['storage-container-cleanup','storage-root-cleanup'].includes(v.measurement));
   }};
   for(const kind of ['storage-owned-fixture','storage-container-cleanup','storage-root-cleanup']){
    reject('missing-'+kind,r=>{r.splice(r.findIndex(v=>v.measurement===kind),1);rebind(r);});
    reject('duplicate-'+kind,r=>{const at=r.findIndex(v=>v.measurement===kind);r.splice(at,0,r[at]);rebind(r);});
    reject('extra-'+kind,r=>{r.push(structuredClone(r.find(v=>v.measurement===kind)));rebind(r);});
   }
   reject('duplicate-one-container-omit-another-consistent',r=>{
    const indices=r.map((v,i)=>v.measurement==='storage-container-cleanup'?i:-1).filter(i=>i>=0);
    r[indices[1]]=structuredClone(r[indices[0]]);rebind(r);
   });
   reject('reused-container-consistent',r=>{
    const fixtures=r.filter(v=>v.measurement==='storage-owned-fixture'),old=fixtures[1].containerId;fixtures[1].containerId=fixtures[0].containerId;
    for(const v of r.filter(v=>v.measurement==='storage-container-cleanup'&&v.containerId===old))v.containerId=fixtures[0].containerId;rebind(r);
   });
   reject('container-already-in-prior-census',r=>{const f=r.find(v=>v.measurement==='storage-owned-fixture');f.preexistingContainers.push(f.containerId.slice(0,12));rebind(r);});
   for(const mode of ['other-fixture','supervisor','same-fixture','extra-root','missing-root'])reject('root-binding-'+mode,r=>{
    const fixtures=r.filter(v=>v.measurement==='storage-owned-fixture'),f=fixtures[1];
    if(mode==='other-fixture')f.roots.content.rootId=fixtures[0].roots.content.rootId;
    if(mode==='supervisor')f.roots.content.rootId=context.supervisor.roots.content.rootId;
    if(mode==='same-fixture')f.roots.content.rootId=f.fixtureRoot.rootId;
    if(mode==='extra-root')f.roots.extra=structuredClone(f.roots.content);
    if(mode==='missing-root')delete f.roots.content;
    const clean=r.find(v=>v.measurement==='storage-root-cleanup'&&v.owner===f.owner);clean.rootIds=Object.values(f.roots).map(v=>v.rootId);rebind(r);
   });
   for(const [i,spec] of d.registrations.entries()){
    const end=rows.findIndex(r=>r.measurement==='storage-full-registration-end'&&r.binding.ordinal===i),at=end-1;
    const change=(r,edit)=>{edit(r[at]);const raw=JSON.stringify(r[at]);r[end].raw=raw;r[end].rawDigest=hash(raw);};
    reject(spec.id+':wrong-source-suite',r=>change(r,v=>v.suite='authority'));
    reject(spec.id+':unknown-header',r=>change(r,v=>v.measurement='unknown-observations'));
    for(const field of spec.positives){
     reject(spec.id+':zero-'+field,r=>change(r,v=>v.positives[field]=0));
     reject(spec.id+':missing-'+field,r=>change(r,v=>delete v.positives[field]));
    }
    for(const field of Object.keys(rows[at].violations))reject(spec.id+':violation-'+field,r=>change(r,v=>v.violations[field]=1));
   }
   // Envelope hostility also challenges the full parser, not only the facility.
   const encoded=rows.map(r=>JSON.stringify(receipt(r))),firstEnd=encoded.findIndex(l=>JSON.parse(l).role==='end');
   const lineReject=(name,edit)=>{const lines=[...encoded];edit(lines);probes.push({name,lines});};
   lineReject('duplicate-envelope',l=>l.splice(0,0,l[0]));lineReject('missing-envelope',l=>l.splice(firstEnd,1));
   lineReject('extra-envelope',l=>l.push(l[0]));lineReject('raw-legacy-envelope',l=>l[0]=JSON.stringify(rows[0]));
   lineReject('duplicate-envelope-key',l=>l[0]=l[0].replace('{','{"version":0,'));
   lineReject('truncated-envelope',l=>l[0]=l[0].slice(0,-1));
   lineReject('protocol-source-substitution',l=>{
    const p=structuredClone(rows[0]);p.binding.sources['scripts/full-receipt-transport.mjs']='sha256:'+'0'.repeat(64);l[0]=JSON.stringify(encodeFullReceipt(p));
   });
   const streams=nativeFrames(id,probes);
   validateFullObservations(streams[0],id,context,schema);
   for(let i=1;i<probes.length;i++){
    assert.throws(()=>validateFullObservations(streams[i],id,context,schema),probes[i].name);
    proof.sourceControls.push({suite:id,name:probes[i].name,nativeFrame:hash(streams[i]),structuralOnly:true,productQualification:false});
   }
   proof.positives.push({suite:id,records:d.records,controlStdoutDigest:hash(streams[0]),structuralOnly:true,productQualification:false});
   const diagnosticCases=diagnosticProbes(),diagnosticFrames=diagnosticCases.map(p=>{
    const lines=[...encoded];lines.splice(1,0,p.line);return {name:p.name,lines};
   });
   for(const name of ['unbound-before','unbound-after','observation-substitution','codec-source-substitution','codec-source-missing']){
    const lines=[...encoded],diagnostic=JSON.stringify(encodeFullDiagnostic(diagnosticCases[0].raw));
    if(name==='unbound-before')lines.unshift(diagnostic);
    if(name==='unbound-after')lines.push(diagnostic);
    if(name==='observation-substitution')lines[sourceIndex]=diagnostic;
    if(name.startsWith('codec-source')){
     const begin=structuredClone(rows[0]);
     if(name==='codec-source-missing')delete begin.binding.sources['scripts/full-diagnostic-transport.mjs'];
     else begin.binding.sources['scripts/full-diagnostic-transport.mjs']='sha256:'+'0'.repeat(64);
     lines[0]=JSON.stringify(encodeFullReceipt(begin));
    }
    diagnosticCases.push({name});diagnosticFrames.push({name,lines});
   }
   const diagnosticStreams=nativeDiagnosticFrames(id+'-diagnostics',diagnosticFrames);
   for(const [i,p] of diagnosticCases.entries()){
    if(p.raw){
     const report=validateFullObservations(diagnosticStreams[i],id,context,schema);
     assert.deepEqual(report.sources,validateFullObservations(streams[0],id,context,schema).sources,'Diagnostics cannot supply or change observations');
     assert.deepEqual(report.diagnostics,[{registration:d.registrations[0].id,raw:p.raw,rawDigest:hash(p.raw),diagnostic:JSON.parse(p.raw),diagnosticOnly:true,productQualification:false}]);
     proof.positives.push({suite:id,diagnostic:p.name,rawDigest:hash(p.raw),nativeFrame:hash(diagnosticStreams[i]),structuralOnly:true,productQualification:false});
    }else{
     assert.throws(()=>validateFullObservations(diagnosticStreams[i],id,context,schema),p.name);
     if(p.name==='raw-diagnostic-refused'){assert.equal(Buffer.byteLength(p.line),158);assert.throws(()=>validateFullObservations(diagnosticStreams[i],id,context,schema),/Raw SQL diagnostic refused/);}
     proof.diagnosticControls.push({suite:id,name:p.name,nativeFrame:hash(diagnosticStreams[i]),structuralOnly:true,productQualification:false});
    }
   }

  });
 }
 assert.equal(proof.diagnosticControls.length,128,'Every closed diagnostic, placement and codec binding refusal through native full admission');
 assert.equal(proof.tapControls.length,20);assert.equal(proof.sourceControls.length,254+14,'Every original observation/cleanup refusal plus full transport controls');
}catch(error){errors.push(error);}
finally{
 try{rmSync(directory,{recursive:true});assert.deepEqual(containers(),before);assert.equal(candidateSnapshot().digest,candidate.digest);assertBaseline();assertCompositionPreservation({all:true});assertExecutionPreservation();assertRecoveryPins();}catch(error){errors.push(error);}
 proof.elapsedMs=performance.now()-started;try{assert(proof.elapsedMs<120000);await drainOutput();}catch(error){errors.push(error);}
}
proof.failureEvidence=errors.map(e=>({name:e.name,message:e.message,stack:e.stack,errors:e instanceof AggregateError?e.errors.map(x=>({name:x.name,message:x.message,stack:x.stack})):[]}));
const proofBinding={candidate,sources:{'scripts/check-full-predecessor-composition.mjs':hash(readFileSync(resolve(cwd,'scripts/check-full-predecessor-composition.mjs'))),'scripts/native-proof-transport.mjs':hash(readFileSync(resolve(cwd,'scripts/native-proof-transport.mjs')))}};
proof.nativeProofSources=proofBinding;
const packedProofBinding={candidate,sources:Object.fromEntries(['scripts/check-full-predecessor-composition.mjs','scripts/native-proof-transport.mjs','scripts/native-proof-dictionary.mjs','scripts/native-proof-packed-transport.mjs','scripts/native-proof-retention.mjs'].map(path=>[path,hash(readFileSync(resolve(cwd,path)))]))};
proof.nativePackedProofSources=packedProofBinding;
try{
 nativeAttempt.recordProof(proof);
 if(errors.length)nativeAttempt.recordFailure(new AggregateError(errors,'Full composition hostile proof failed; original gates remain required'),'original-checks');
 try{const receipt=await emitPackedNativeProof(proof,proofBinding,packedProofBinding);nativeAttempt.recordEmitted(receipt);}
 catch(error){errors.push(error);try{nativeAttempt.recordFailure(error,'emission');}catch(retentionError){errors.push(retentionError);}}
}catch(error){errors.push(error);try{nativeAttempt.recordFailure(error,'proof-retention');}catch(retentionError){errors.push(retentionError);}}

if(errors.length)throw new AggregateError(errors,'Full composition hostile proof failed; original gates remain required');
