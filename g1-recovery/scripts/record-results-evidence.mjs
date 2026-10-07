import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),ids=process.argv.slice(2);
if(!ids.length||ids.some(id=>!/^job-[a-f0-9]+$/.test(id)))throw new Error('Explicit finished controller job IDs required');
const state=JSON.parse(readFileSync(resolve(root,'.loop/goals/agent-fabric-g1-f03-recovery/state.json'),'utf8'));
const events=readFileSync(resolve(root,'.loop/goals/agent-fabric-g1-f03-recovery/events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const path=resolve(root,'g1-recovery/evidence/results-controller.json');
const index=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{schemaVersion:1,scope:'Separate durable Task/attempt, artifact/check/delivery and actual independent local notification rejection/ACK loss with recreated authorized result brokers. No production object storage, irreversible provider publication, APNs/FCM, physical clients or full G1 qualification.',pins:{node:'22.22.3',pnpm:'10.18.0',typescript:'5.9.3',pg:'8.16.3',postgres:'16.12'},runs:[]};
for(const id of ids){
 if(index.runs.some(row=>row.jobId===id))continue;
 const job=state.jobs[id];if(!job||job.status!=='finished')throw new Error('Finished controller job required: '+id);
 const event=events.findLast(row=>row.type==='job.finished'&&row.data.job===id);if(!event)throw new Error('Actual controller completion event required');
 const checks=job.checks.map(checkId=>{
  const dir=resolve(root,'.loop/goals/agent-fabric-g1-f03-recovery/runs/checks',id,checkId);
  const streams=['stdout','stderr'].map(name=>{const streamPath=resolve(dir,name+'.log'),bytes=readFileSync(streamPath);return {path:relative(root,streamPath),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),text:bytes.toString('utf8')};});
  const metrics={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const matches=[...streams[0].text.matchAll(new RegExp('^# '+key+' (\\d+)$','gm'))];metrics[key]=matches.length?matches.reduce((total,row)=>total+Number(row[1]),0):null;}
  const current=state.checks[checkId];return {checkId,status:event.data.results[checkId],result:current?.log===relative(root,dir)?current:null,metrics,streams};
 });
 index.runs.push({jobId:id,job,completionEvent:event,checks,postCheckIndexUpdate:true});
}
writeFileSync(path,JSON.stringify(index,null,2)+'\n');console.log('Preserved complete controller streams and original completion events: '+ids.join(', '));
