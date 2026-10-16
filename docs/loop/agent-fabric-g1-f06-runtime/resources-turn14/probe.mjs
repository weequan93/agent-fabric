// Resource diagnostics only. No product qualification, Docker, GUI or remote access.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, renameSync, symlinkSync, existsSync} from 'node:fs';
import {tmpdir, availableParallelism, totalmem, freemem, loadavg, release} from 'node:os';
import {join, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {once} from 'node:events';

const root = process.cwd();
assert.equal(existsSync(resolve(root,'docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/results.json')),false,'Preserve the recorded resource run; use a new output location for another run');
const folder = mkdtempSync(join(tmpdir(), 'af-f06-resource-'));
const records = [];
async function probe(name, fn) {
  const started = performance.now();
  try { records.push({name, result:'ready', observation:await fn(), elapsedMs:performance.now()-started}); }
  catch(e) { records.push({name, result:'missing', error:{message:e.message, code:e.code??null}, elapsedMs:performance.now()-started}); }
}
function command(cmd, args, cwd=root, timeout=20000) {
  const r=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout,maxBuffer:1024*1024});
  const observation={command:[cmd,...args],status:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout??'',stderr:r.stderr??''};
  if(r.error||r.status!==0) { const e=new Error(JSON.stringify(observation)); e.code=r.error?.code; throw e; }
  return observation;
}
try {
  await probe('host',()=>({node:process.version,execPath:process.execPath,platform:process.platform,arch:process.arch,kernel:release(),availableParallelism:availableParallelism(),totalmem:totalmem(),freemem:freemem(),loadavg:loadavg()}));
  for(const c of ['node','pnpm','python3','git','psql','postgres','initdb'])await probe('version-'+c,()=>command(c,['--version']));
  await probe('compiler',()=>command(process.execPath,['node_modules/typescript/bin/tsc','--version']));
  await probe('process-census',()=>command('ps',['-p',String(process.pid),'-o','pid=,ppid=,pgid=,lstart=,comm='],root,2000));
  await probe('cpu-sysctl',()=>command('sysctl',['-n','hw.ncpu'],root,2000));
  await probe('memory-sysctl',()=>command('sysctl',['-n','hw.memsize'],root,2000));
  await probe('disk',()=>command('df',['-h',root,folder]));
  await probe('sqlite-wal-process',()=>{
    const path=join(folder,'queue.sqlite'); const db=new DatabaseSync(path);
    try {
      const mode=db.prepare('PRAGMA journal_mode=WAL').get();
      db.exec('CREATE TABLE tickets(id INTEGER PRIMARY KEY, value TEXT); BEGIN IMMEDIATE; INSERT INTO tickets VALUES(1,\'parent\')');
      const busy=command(process.execPath,['--input-type=module','-e',`import {DatabaseSync} from 'node:sqlite'; const d=new DatabaseSync(process.argv[1]); try{d.exec('BEGIN IMMEDIATE');process.exitCode=2}catch(e){if(!/locked|busy/i.test(e.message))throw e; console.log(JSON.stringify({lockRefused:true,code:e.code,errcode:e.errcode}));}finally{d.close()}`,path]);
      db.exec('COMMIT');
      const reopened=command(process.execPath,['--input-type=module','-e',`import {DatabaseSync} from 'node:sqlite'; const d=new DatabaseSync(process.argv[1]); d.exec("BEGIN IMMEDIATE; INSERT INTO tickets VALUES(2,'child'); COMMIT"); console.log(JSON.stringify(d.prepare('SELECT * FROM tickets ORDER BY id').all())); d.close();`,path]);
      assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n,2);
      return {mode,busy,reopened,rows:2};
    } finally { db.close(); }
  });
  await probe('owned-filesystem',()=>{
    const a=join(folder,'staged'),b=join(folder,'canonical');writeFileSync(a,'synthetic');renameSync(a,b);assert.equal(readFileSync(b,'utf8'),'synthetic');
    symlinkSync(b,join(folder,'alias'));assert.equal(readFileSync(join(folder,'alias'),'utf8'),'synthetic');return {atomicRename:true,symlinkFixture:true};
  });
  await probe('loopback-http',async()=>{
    const server=createServer((_q,r)=>r.end('synthetic-resource-probe'));
    try {await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});const a=server.address();const r=await fetch(`http://127.0.0.1:${a.port}`,{signal:AbortSignal.timeout(2000)});assert.equal(await r.text(),'synthetic-resource-probe');return {status:r.status,listenerClosedInFinally:true};}
    finally {if(server.listening)await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}
  });
  await probe('shell',()=>command('/bin/sh',['-c','printf synthetic-owned-shell']));
  await probe('stdio-json-rpc',()=>{
    const r=spawnSync(process.execPath,['-e',`let b='';process.stdin.on('data',x=>b+=x);process.stdin.on('end',()=>{const q=JSON.parse(b);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result:'synthetic-stdio'}))});`],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'probe'}),encoding:'utf8',timeout:2000});
    assert.equal(r.status,0);assert.deepEqual(JSON.parse(r.stdout),{jsonrpc:'2.0',id:1,result:'synthetic-stdio'});return {status:r.status,stdout:r.stdout,stderr:r.stderr};
  });
  await probe('owned-child-lifecycle',async()=>{
    const c=spawn(process.execPath,['-e',`process.stdout.write('ready');setInterval(()=>{},1000)`],{stdio:['ignore','pipe','pipe']});
    const death=once(c,'exit');const timer=setTimeout(()=>c.kill('SIGKILL'),2500);
    try {await once(c.stdout,'data');assert.equal(c.kill('SIGTERM'),true);const [code,signal]=await death;return {pid:c.pid,code,signal,liveOwnedChildHandleOnly:true};}
    finally{clearTimeout(timer);if(c.exitCode===null&&c.signalCode===null){c.kill('SIGKILL');await death;}}
  });
  await probe('installed-owner-dependencies',()=>{
    const packages={};for(const dir of ['.','g1-foundations','g1-identity','g1-recovery','g1-model','g1-storage']){
      const req=createRequire(resolve(root,dir,'package.json'));packages[dir]={};
      for(const name of ['typescript','@types/node',...(dir==='.'?[]:['pg','@types/pg'])])packages[dir][name]=req(name+'/package.json').version;
    } return packages;
  });
  await probe('offline-frozen-dependency-install',()=>{
    const work=join(folder,'package');command('mkdir',['-p',work]);
    for(const f of ['package.json','pnpm-lock.yaml'])writeFileSync(join(work,f),readFileSync(join(root,f)));
    return command('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'],work);
  });
  for(const owner of ['g1-foundations','g1-identity','g1-recovery','g1-model','g1-storage'])await probe('offline-'+owner,()=>{const work=join(folder,owner);command('mkdir',['-p',work]);for(const f of ['package.json','pnpm-lock.yaml'])writeFileSync(join(work,f),readFileSync(join(root,owner,f)));return command('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'],work,30000);});
  await probe('strict-owner-noemit',()=>{
    const path=join(folder,'owner-probe.mts');
    const modules=['engine/kernel/src/session-loop.ts','g1-foundations/src/postgres-uow.ts','g1-identity/src/current-authority.ts','g1-recovery/src/effect-repository.ts','g1-model/src/native-imports.ts','g1-storage/src/owners.ts','g1-storage/src/native-ask.ts','g1-storage/src/artifact-publication.ts'];
    writeFileSync(path,modules.map((x,i)=>`import type * as M${i} from ${JSON.stringify(join(root,x))};`).join('\n'));
    return command(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--strict','--noUncheckedIndexedAccess','--exactOptionalPropertyTypes','--target','ES2023','--lib','ES2024','--esModuleInterop','--module','NodeNext','--moduleResolution','NodeNext','--allowImportingTsExtensions','--skipLibCheck',path],root,30000);
  });
  await probe('monotonic-clock',()=>{const a=performance.now();const b=performance.now();assert.ok(b>=a);return {clock:'performance.now',resolutionObservedMs:b-a,qualifiedTiming:false};});
} finally {
  rmSync(folder,{recursive:true,force:true});
  records.push({name:'owned-temp-cleanup',result:'ready',observation:{removed:folder,scope:'only mkdtemp-created directory'}});
}
const result={schemaVersion:1,kind:'resource-diagnostics-only',observedAt:new Date().toISOString(),dockerInvoked:false,remoteInvoked:false,productTestsRun:false,records};
writeFileSync(resolve(root,'docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(records.map(r=>({name:r.name,result:r.result,...(r.error?{error:r.error}:{})})),null,2));
