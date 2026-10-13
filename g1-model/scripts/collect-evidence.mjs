import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './paths.mjs';
import { sha, candidateSnapshot, controllerRoot } from './qualification-artifacts.mjs';
if(process.argv.length!==2)throw new Error('Collector accepts no arguments');
const evidence=resolve(root,'g1-model/evidence'),state=JSON.parse(readFileSync(resolve(root,controllerRoot,'state.json'),'utf8'));
function immutable(path,bytes){if(existsSync(path)){if(!readFileSync(path).equals(bytes))throw new Error('Immutable evidence collision');}else writeFileSync(path,bytes,{flag:'wx'});}
const indexPath=resolve(evidence,'streams.json'),index=existsSync(indexPath)?JSON.parse(readFileSync(indexPath,'utf8')):{schemaVersion:1,records:[]};
for(const job of readdirSync(resolve(root,controllerRoot,'runs/checks')).sort()) {
 const dir=resolve(root,controllerRoot,'runs/checks',job);
 for(const check of readdirSync(dir).sort())for(const stream of ['stdout','stderr']) {
  const original=controllerRoot+'/runs/checks/'+job+'/'+check+'/'+stream+'.log';if(!existsSync(resolve(root,original)))continue;
  const bytes=readFileSync(resolve(root,original)),path='g1-model/evidence/raw/'+job+'/'+check+'/'+stream+'.log';mkdirSync(resolve(root,'g1-model/evidence/raw',job,check),{recursive:true});immutable(resolve(root,path),bytes);
  const record={job,check,stream,original,path,bytes:bytes.length,sha256:sha(bytes),status:state.jobs[job]?.results?.[check]??'unfinished',qualification:'historical-observation; not current acceptance'};
  const old=index.records.find(r=>r.original===original);if(old){if(old.bytes!==record.bytes||old.sha256!==record.sha256)throw new Error('Historical raw altered');}else index.records.push(record);
 }
}
writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');
const snapshot=candidateSnapshot(),candidatePath=resolve(evidence,'candidate.json');const candidateBytes=Buffer.from(JSON.stringify(snapshot,null,2)+'\n');immutable(resolve(evidence,'candidate-'+snapshot.digest+'.json'),candidateBytes);writeFileSync(candidatePath,candidateBytes);
const now=new Date().toISOString().replaceAll(':','-'),delivery={schemaVersion:1,recordedAt:now,behaviorCandidate:snapshot.digest,files:Object.fromEntries(['docs/planning/g1-f04-plan.md','docs/evidence/g1-f04-acceptance.md','g1-model/evidence/qualification-status.json','g1-model/evidence/streams.json'].map(p=>[p,sha(readFileSync(resolve(root,p)))])),postCheckEdits:'Evidence indexes/documents are recorded after controller observations. Full integrated task/final checks rerun after edits; prior job passes are history, not later-candidate acceptance.'};
immutable(resolve(evidence,'delivery-'+now+'.json'),Buffer.from(JSON.stringify(delivery,null,2)+'\n'));
const history={schemaVersion:1,controllerUsage:{source:controllerRoot+'/state.json',observedAt:now,snapshot:state.usage},usageClaim:'retained-controller-cumulative-history; no zero host-cost claim',failedJobs:Object.entries(state.jobs).filter(([,j])=>Object.values(j.results??{}).some(v=>v!=='pass')).map(([id,j])=>({id,results:j.results,status:j.status})),allJobs:Object.keys(state.jobs),priorControllerTurns:state.turns.length,findings:state.findings,incidents:state.incidents};
const historyBytes=Buffer.from(JSON.stringify(history,null,2)+'\n');immutable(resolve(evidence,'history-'+now+'.json'),historyBytes);writeFileSync(resolve(evidence,'history.json'),historyBytes);
console.log(JSON.stringify({measurement:'complete-evidence-collection',streams:index.records.length,failedJobs:history.failedJobs.length,behaviorCandidate:snapshot.digest,deliverySnapshot:'g1-model/evidence/delivery-'+now+'.json'}));
