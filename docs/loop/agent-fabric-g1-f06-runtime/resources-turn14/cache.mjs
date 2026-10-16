// Complete declared recovery install input; diagnostics only. No product checks.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
const out='docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/cache-results.json';
if(existsSync(out))throw new Error('Preserve prior result');
const temp=mkdtempSync(join(tmpdir(),'af-f06-recovery-offline-')),result={kind:'resource-diagnostics-only',dockerInvoked:false,remoteInvoked:false,productTestsRun:false};
try{
 const pkg=JSON.parse(readFileSync('g1-recovery/package.json','utf8'));
 const inputs=['package.json','pnpm-lock.yaml',...Object.values(pkg.pnpm.patchedDependencies)];
 for(const f of inputs){mkdirSync(dirname(join(temp,f)),{recursive:true});writeFileSync(join(temp,f),readFileSync(join('g1-recovery',f)));}
 const empty=join(temp,'empty-npmrc');writeFileSync(empty,'');
 const args=['install','--ignore-workspace','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store','--config.registry=https://registry.npmjs.org/','--config.userconfig='+empty,'--config.globalconfig='+empty,'--fetch-retries=0','--fetch-timeout=10000'];
 const r=spawnSync('pnpm',args,{cwd:temp,encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
 const fresh=join(temp,'offline');mkdirSync(fresh);for(const f of inputs){mkdirSync(dirname(join(fresh,f)),{recursive:true});writeFileSync(join(fresh,f),readFileSync(join('g1-recovery',f)));}
 const offlineArgs=['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'];
 const off=spawnSync('pnpm',offlineArgs,{cwd:fresh,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 result.offlineRecheck={command:['pnpm',...offlineArgs],status:off.status,error:off.error?.message??null,stdout:off.stdout,stderr:off.stderr};
 Object.assign(result,{observedAt:new Date().toISOString(),inputs,command:['pnpm',...args],cwd:temp,status:r.status,error:r.error?.message??null,stdout:r.stdout,stderr:r.stderr});
}finally{rmSync(temp,{recursive:true,force:true});result.ownedTempRemoved=!existsSync(temp);}
writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
