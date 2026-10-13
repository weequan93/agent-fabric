// Observational only: existing fixture ownership/census and cleanup gates remain
// unchanged. Capture complete parent clocks and read-only global identities on
// both success and failure; never act on a census identity.
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { readdirSync,lstatSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { emitMeasurement, drainOutput, measurementDigest } from './measurement-transport.mjs';
function snapshot(){
 const ps=spawnSync('ps',['-axo','pid=,ppid=,lstart=,comm='],{encoding:'utf8',timeout:5000});
 const docker=spawnSync('docker',['ps','-a','--filter','label=agent-fabric.storage-fixture-owner','--no-trunc','--format','{{.ID}}'],{encoding:'utf8',timeout:5000});
 if(ps.error||ps.status!==0||!ps.stdout.trim()||docker.error||docker.status!==0)throw new Error('Execution measurement census unavailable');
 const roots=[];
 for(const name of readdirSync('/private/tmp').sort()){
  if(!name.startsWith('agent-fabric-storage-'))continue;
  const path=resolve('/private/tmp',name),stat=lstatSync(path);
  const marker=resolve(path,'.storage-owner.json');
  roots.push({path,device:stat.dev,inode:stat.ino,symlink:stat.isSymbolicLink(),marker:!stat.isSymbolicLink()&&stat.isDirectory()&&lstatSync(marker,{throwIfNoEntry:false})?JSON.parse(readFileSync(marker,'utf8')):null});
 }
 return {processBytes:ps.stdout,containerBytes:docker.stdout,processes:ps.stdout.trimEnd().split('\n'),processDigest:'sha256:'+createHash('sha256').update(ps.stdout).digest('hex'),containers:docker.stdout.trim().split('\n').filter(Boolean).sort(),roots};
}
function transportBinding(phase,bindings){
 return {phase,candidate:bindings.candidate,command:{executable:process.execPath,args:[...process.execArgv,...process.argv.slice(1)],cwd:process.cwd()},
  sources:Object.fromEntries(['execution-measurement.mjs','measurement-transport.mjs','runner.mjs','suite-execution.mjs','build.mjs','process-result.mjs']
   .map(path=>[path,measurementDigest(readFileSync(new URL(path,import.meta.url)))]))};
}
export function startMeasurement(phase,bindings={},census=false){
 const started=performance.now();const before=census?snapshot():null,binding=transportBinding(phase,bindings);
 const ready=emitMeasurement({measurement:'storage-parent-start',phase,clock:'parent-monotonic',startedMs:started,...bindings,...(census?{before}:{})},binding);
 return {phase,started,bindings,binding,census,before,ready};
}
export async function endMeasurement(state,outcome={}){
 const errors=[];
 try{await state.ready;}catch(error){errors.push(error);}
 try{
  const after=state.census?snapshot():null,ended=performance.now();
  await emitMeasurement({measurement:'storage-parent-return',phase:state.phase,clock:'parent-monotonic',startedMs:state.started,returnedMs:ended,elapsedMs:ended-state.started,...state.bindings,...outcome,...(state.census?{before:state.before,after}:{})},state.binding);
 }catch(error){errors.push(error);}
 try{await drainOutput();}catch(error){errors.push(error);}
 if(errors.length)throw new AggregateError(errors,'Measurement transport failed; original diagnostics retained');
}
