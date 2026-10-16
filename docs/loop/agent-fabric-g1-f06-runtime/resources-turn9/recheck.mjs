// Bounded resource rechecks; preserve results.json, including initial failures.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=process.cwd(),results=[];
if(existsSync(resolve(root,'docs/loop/agent-fabric-g1-f06-runtime/resources-turn9/recheck-results.json')))throw new Error('Preserve recorded recheck; use a new output location for another run');
const folder=mkdtempSync(join(tmpdir(),'af-f06-recheck-'));
function run(name,command,args,cwd=root,timeout=30000){
  const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout,maxBuffer:1024*1024});
  const record={name,command:[command,...args],cwd,status:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout??'',stderr:r.stderr??''};results.push(record);return !r.error&&r.status===0;
}
try {
  const online=join(folder,'populate'),offline=join(folder,'offline');
  const emptyConfig=join(folder,'empty-npmrc');writeFileSync(emptyConfig,'');
  for(const work of [online,offline]){mkdirSync(work);for(const f of ['package.json','pnpm-lock.yaml'])writeFileSync(join(work,f),readFileSync(join(root,f)));}
  const common=['install','--ignore-workspace','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'];
  const populated=run('populate-pinned-cache','pnpm',[...common,'--config.registry=https://registry.npmjs.org/','--config.userconfig='+emptyConfig,'--config.globalconfig='+emptyConfig,'--fetch-retries=0','--fetch-timeout=10000'],online);
  run('fresh-frozen-offline','pnpm',[...common,'--offline'],offline);
  const specimen=join(folder,'owners.mts');
  const modules=['engine/kernel/src/session-loop.ts','g1-foundations/src/postgres-uow.ts','g1-identity/src/current-authority.ts','g1-recovery/src/effect-repository.ts','g1-model/src/native-imports.ts','g1-storage/src/owners.ts','g1-storage/src/native-ask.ts','g1-storage/src/artifact-publication.ts'];
  writeFileSync(specimen,modules.map((x,i)=>`import type * as M${i} from ${JSON.stringify(join(root,x))};`).join('\n'));
  run('strict-owner-noemit-es2024','node',['node_modules/typescript/bin/tsc','--noEmit','--strict','--noUncheckedIndexedAccess','--exactOptionalPropertyTypes','--target','ES2023','--lib','ES2024','--module','NodeNext','--moduleResolution','NodeNext','--allowImportingTsExtensions','--esModuleInterop',specimen]);
  results.push({name:'runtime-isWellFormed',supported:typeof ''.isWellFormed==='function'});
  results.push({name:'network-scope',registry:'public npm only',paidResources:false,credentialsRequired:false,populated});
} finally {rmSync(folder,{recursive:true,force:true});results.push({name:'owned-cleanup',removed:folder});}
const record={schemaVersion:1,kind:'resource-diagnostics-only',observedAt:new Date().toISOString(),dockerInvoked:false,remoteTestEnvironmentAccessed:false,results};
writeFileSync(resolve(root,'docs/loop/agent-fabric-g1-f06-runtime/resources-turn9/recheck-results.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
