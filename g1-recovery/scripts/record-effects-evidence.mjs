// Read controller-owned results; never edit controller state or raw streams.
import {readFileSync,writeFileSync,readdirSync,lstatSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),pkg=resolve(root,'g1-recovery');
const jobs=process.argv.slice(2);if(!jobs.length||jobs.some(j=>!/^job-[a-f0-9]+$/.test(j)))throw new Error('Explicit controller job IDs required');
const state=JSON.parse(readFileSync(resolve(root,'.loop/goals/agent-fabric-g1-f03-recovery/state.json'),'utf8'));
const indexPath=resolve(pkg,'evidence/effects-controller.json'),index=existsSync(indexPath)?JSON.parse(readFileSync(indexPath,'utf8')):{schemaVersion:1,scope:'Local durable loopback HTTP effect, PostgreSQL authority, Temporal crash/recreation and replay only. No real downstream/remote containment/whole F03 qualification.',checkCommand:'node g1-recovery/scripts/check-slice.mjs effects',pins:{node:'22.22.3',pnpm:'10.18.0',typescript:'5.9.3',temporalCli:'1.4.1',temporalServer:'1.28.0',temporalSDK:'1.24.0'},runs:[]};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const id of jobs){
 if(index.runs.some(r=>r.jobId===id))continue;
 const job=state.jobs[id];if(!job||job.status!=='finished')throw new Error('Finished controller job required');
 const checkId='f03-unknown-effects.f03-effects-crash',log=resolve(root,'.loop/goals/agent-fabric-g1-f03-recovery/runs/checks',id,checkId);
 const streams=['stdout','stderr'].map(name=>{const path=resolve(log,name+'.log'),bytes=readFileSync(path);return {path:relative(root,path),bytes:bytes.length,sha256:hash(bytes),text:bytes.toString('utf8')};});
 const current=state.checks[checkId],result=current.log===relative(root,log)?current:null;
 const artifacts=[],parents=new Set();
 for(const line of streams[0].text.split('\n')){
  const raw=line.startsWith('# ')?line.slice(2):line;let row;try{row=JSON.parse(raw);}catch{continue;}
  if(row.measurement==='effect-worker-process'&&row.measurementPath)parents.add(dirname(row.measurementPath));
 }
 for(const parent of parents){
  const ownedRoots=[resolve(pkg,'node_modules/.cache/effects-evidence'),resolve(pkg,'evidence/effects')];
  if(!ownedRoots.some(r=>dirname(parent)===r)||!/^[-a-f0-9]{36}$/.test(parent.split('/').at(-1)))throw new Error('Refusing unowned artifact root');
  const target=resolve(pkg,'evidence/effects',parent.split('/').at(-1));mkdirSync(target,{recursive:true});
  for(const name of readdirSync(parent).sort()){
   const source=resolve(parent,name);if(!lstatSync(source).isFile())throw new Error('Regular raw artifact required');const bytes=readFileSync(source),destination=resolve(target,name);
   if(existsSync(destination)){if(!readFileSync(destination).equals(bytes))throw new Error('Refusing raw evidence overwrite');}
   else writeFileSync(destination,bytes,{flag:'wx'});
   artifacts.push({originalPath:relative(root,source),copyPath:relative(root,destination),bytes:bytes.length,sha256:hash(bytes)});
  }
 }
 index.runs.push({jobId:id,job,result,streams,artifacts,postCheckIndexUpdate:true});
}
writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');console.log('Preserved complete controller streams and exact artifact copies for '+jobs.join(', '));
