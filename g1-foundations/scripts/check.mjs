import {spawnSync} from 'node:child_process';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
function run(command,args,env=process.env,timeout=60000){const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:16*1024*1024});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.error||r.status!==0)throw r.error??new Error(command+' failed '+r.status);return r.stdout;}
const ledger=readFileSync(new URL('../../docs/planning/g1-remaining-ledger.csv',import.meta.url),'utf8');
const ids=[...Array.from({length:20},(_,i)=>'AF-'+String(i+1).padStart(2,'0')),...Array.from({length:18},(_,i)=>'UX-'+String(i+1).padStart(2,'0'))];
if(ledger.trim().split('\n').length!==39||ids.some(id=>ledger.split('\n').filter(row=>row.startsWith(id+',')).length!==1)||!ledger.includes('pending full qualification'))throw new Error('Complete all38 remaining obligations required');
console.log('full-38-id-ledger: all AF/UX obligations retained; full qualification pending');
run('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store']);
run(process.execPath,['scripts/build.mjs']);
const {withPgFixture}=await import('./pg-fixture.mjs');
const tests=readdirSync(cwd+'/node_modules/.cache/foundation-build/tests').filter(p=>p.endsWith('.test.js')).sort().map(p=>cwd+'/node_modules/.cache/foundation-build/tests/'+p);
if(tests.length<2||!tests.some(p=>p.endsWith('/postgres.test.js')))throw new Error('Contract and actual PostgreSQL suites required');
await withPgFixture(async ({connectionString})=>{
 const output=run(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...tests],{...process.env,FOUNDATION_DATABASE_URL:connectionString},100000);
 const totals=[...output.matchAll(/^# tests (\d+)$/gm)];
 if(totals.length===0||totals.some(x=>Number(x[1])===0)||!/^ok \d+ - /m.test(output)||/^not ok \d+ - /m.test(output)||/^# (?:skipped|todo) [1-9]/m.test(output)||/^(?:ok|not ok) .*# (?:SKIP|TODO)/mi.test(output))throw new Error('Actual nonempty pass with no skip/TODO required');
 for(const name of ['missing-scope','cross-tenant-space','nonprivileged-role','worker-no-grants','current-membership-payer','current-session-expiry-revocation','reused-pool-reset','atomic-outbox','idempotency-conflict','revision-concurrency','rollback-reopen','unknown-commit-lookup','migration-recovery'])if(!output.includes('PG/'+name))throw new Error('Missing actual PG case '+name);
});
run(process.execPath,['scripts/remote-probe.mjs'],process.env,30000);
console.log('Foundation strict build, actual owned PostgreSQL behavior and bounded read-only system probe passed. Full G1 qualification remains pending.');
