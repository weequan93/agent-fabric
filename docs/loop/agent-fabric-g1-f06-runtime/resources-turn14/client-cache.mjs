// Complete declared recovery install input; diagnostics only. No product checks.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
const out='docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/client-cache-results.json';
if(existsSync(out))throw new Error('Preserve prior result');
const temp=mkdtempSync(join(tmpdir(),'af-f06-recovery-offline-')),result={kind:'resource-diagnostics-only',dockerInvoked:false,remoteInvoked:false,productTestsRun:false};
try{
 result.checks=[];
 for(const owner of ['g1-local','g1-local/web','g1-local/desktop','g1-local/mobile']){
  const work=join(temp,owner);mkdirSync(work,{recursive:true});const pkg=JSON.parse(readFileSync(join(owner,'package.json'),'utf8'));
  const inputs=['package.json','pnpm-lock.yaml',...Object.values(pkg.pnpm?.patchedDependencies??{})];
  for(const f of inputs){mkdirSync(dirname(join(work,f)),{recursive:true});writeFileSync(join(work,f),readFileSync(join(owner,f)));}
  const args=['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'];
  const r=spawnSync('pnpm',args,{cwd:work,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  result.checks.push({owner,command:['pnpm',...args],inputs,status:r.status,error:r.error?.message??null,stdout:r.stdout,stderr:r.stderr});
 }
 result.observedAt=new Date().toISOString();
}finally{rmSync(temp,{recursive:true,force:true});result.ownedTempRemoved=!existsSync(temp);}
writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
