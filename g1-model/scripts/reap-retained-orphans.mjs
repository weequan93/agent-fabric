import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './paths.mjs';
// Supplemental controller maintenance for this exact retained timed-out run.
// Never signals an unobserved historical PID, unrelated child, or process group.
if(process.argv.length!==2)throw new Error('No cleanup arguments accepted');
const base=resolve(root,'.loop/goals/agent-fabric-g1-f04-model-finops/runs/checks/job-1efe711b2c/f04-12.suite-native-wait-resource');
const stdout=readFileSync(resolve(base,'stdout.log')),stderr=readFileSync(resolve(base,'stderr.log'));
const digest=b=>createHash('sha256').update(b).digest('hex');
if(digest(stdout)!=='44448881dcdedda8717dc7756a74d88f90f253da8049a4a1fa797a97658e98a1'||digest(stderr)!=='ffb4dda280d7edac63ea7eda9aa78f580ae1d9564370938d48523764d44459ad'||!stderr.toString().includes('ETIMEDOUT'))throw new Error('Retained timeout witness mismatch');
const records=stdout.toString().split('\n').flatMap(line=>{const s=line.replace(/^# /,'');if(!s.startsWith('{'))return [];try{return [JSON.parse(s)];}catch{return [];}});
if(!records.some(r=>r.measurement==='model-owned-postgres-cleanup'&&r.owner==='61220292-fdf1-4fdf-9076-28a553f5f54e'&&r.removed===true))throw new Error('Owned fixture removal unproven');
const launched=records.filter(r=>r.measurement==='model-owned-process'),removed=records.filter(r=>r.measurement==='model-owned-process-cleanup'&&r.removed===true),witnesses=launched.filter(r=>!removed.some(s=>s.pid===r.pid&&s.instance===r.instance));
if(witnesses.length!==2||!witnesses.every(r=>r.ppid===8940&&[9254,9258].includes(r.pid)))throw new Error('Unexpected orphan witness set');
const census=()=>{const r=spawnSync('/bin/ps',['-axo','pid=,ppid=,pgid=,lstart=,command='],{encoding:'utf8',timeout:3000,env:{PATH:process.env.PATH,LC_ALL:'C'},maxBuffer:4*1024*1024});if(r.error||r.status!==0)throw new Error('Mandatory cleanup census failed');return r.stdout.trim().split('\n').map(line=>{const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/.exec(line);if(!m)throw new Error('Invalid census row');return {pid:Number(m[1]),ppid:Number(m[2]),instance:m[3]+'/'+m[4],command:m[5]};});};
const allowed=['g1-model/node_modules/.cache/model-build/g1-model/tests/helpers/idp-process.js','g1-model/node_modules/.cache/model-build/g1-model/src/test-adapter-process.js'].map(p=>resolve(root,p));
const live=(rows,w)=>rows.find(r=>r.command.includes(w.marker));
const verify=(rows,w,expected)=>{const r=live(rows,w);if(!r||r.pid!==w.pid||r.instance!==w.instance||r.ppid!==1||!allowed.some(p=>r.command.endsWith(p+' '+w.marker))||rows.some(c=>c.ppid===r.pid)||rows.some(p=>p.pid===w.ppid&&p.instance===w.instance)||(expected&&r.command!==expected.command))throw new Error('Current owned orphan identity unproven');return r;};
for(const w of witnesses){let rows=census(),r=live(rows,w);if(!r){console.log(JSON.stringify({measurement:'retained-owned-orphan-cleanup',pid:w.pid,instance:w.instance,marker:w.marker,alreadyAbsent:true,removed:true,sourceSha256:digest(stdout)}));continue;}
 r=verify(rows,w);process.kill(r.pid,'SIGTERM');const deadline=Date.now()+5000;while(Date.now()<deadline&&live(census(),w))await new Promise(done=>setTimeout(done,20));
 if(live(census(),w)){verify(census(),w,r);process.kill(r.pid,'SIGKILL');const end=Date.now()+2000;while(Date.now()<end&&live(census(),w))await new Promise(done=>setTimeout(done,20));}
 if(live(census(),w))throw new Error('Owned orphan removal unproven');console.log(JSON.stringify({measurement:'retained-owned-orphan-cleanup',pid:w.pid,instance:w.instance,marker:w.marker,observedParent:r.ppid,removed:true,sourceSha256:digest(stdout)}));
}
if(witnesses.some(w=>live(census(),w)))throw new Error('Retained orphan survives cleanup');
