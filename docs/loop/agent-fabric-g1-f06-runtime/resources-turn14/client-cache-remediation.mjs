// Complete declared recovery install input; diagnostics only. No product checks.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
const out='docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/client-cache-remediation-results.json';
if(existsSync(out))throw new Error('Preserve prior result');
const temp=mkdtempSync(join(tmpdir(),'af-f06-recovery-offline-')),result={kind:'resource-diagnostics-only',dockerInvoked:false,remoteInvoked:false,productTestsRun:false};
try{
 result.checks=[];
 for(const owner of ['g1-local/web','g1-local/desktop','g1-local/mobile']){
  const work=join(temp,owner);mkdirSync(work,{recursive:true});const pkg=JSON.parse(readFileSync(join(owner,'package.json'),'utf8'));
  const inputs=['package.json','pnpm-lock.yaml',...Object.values(pkg.pnpm?.patchedDependencies??{})];
  for(const f of inputs){mkdirSync(dirname(join(work,f)),{recursive:true});writeFileSync(join(work,f),readFileSync(join(owner,f)));}
  const args=['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'];
  const empty=join(work,'empty-npmrc');writeFileSync(empty,'');const onlineArgs=args.filter(x=>x!=='--offline').concat(['--config.registry=https://registry.npmjs.org/','--config.userconfig='+empty,'--config.globalconfig='+empty,'--fetch-retries=0','--fetch-timeout=10000']);
  const online=spawnSync('pnpm',onlineArgs,{cwd:work,encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
  const fresh=join(temp,'offline',owner);mkdirSync(fresh,{recursive:true});for(const f of inputs){mkdirSync(dirname(join(fresh,f)),{recursive:true});writeFileSync(join(fresh,f),readFileSync(join(owner,f)));}
  const r=spawnSync('pnpm',args,{cwd:fresh,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  result.checks.push({owner,online:{command:['pnpm',...onlineArgs],status:online.status,error:online.error?.message??null,stdout:online.stdout,stderr:online.stderr},command:['pnpm',...args],inputs,status:r.status,error:r.error?.message??null,stdout:r.stdout,stderr:r.stderr});
 }
 result.observedAt=new Date().toISOString();
}finally{rmSync(temp,{recursive:true,force:true});result.ownedTempRemoved=!existsSync(temp);}
writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
