const args=process.argv.slice(2);if(args.length>1||args.length===1&&!['results','notifications'].includes(args[0]))throw new Error('Explicit known result suite selection required');
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTap} from './run-suites.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
function run(command,args,cwd,env=process.env){
 const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
 process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');
 if(r.error||r.status!==0)throw r.error??new Error(command+' failed '+r.status);return r.stdout;
}
for(const pkg of ['g1-foundations','g1-identity'])run('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'],resolve(root,pkg));
run(process.execPath,['scripts/build.mjs'],resolve(root,'g1-foundations'));
const {withPgFixture}=await import('../../g1-foundations/scripts/pg-fixture.mjs');
const {migrateFoundation}=await import('../../g1-foundations/node_modules/.cache/foundation-build/src/migration.js');
const pg=(await import('pg')).default;

const files=args[0]==='results'?['results-notifications.test.js']:args[0]==='notifications'?['notifications.test.js']:['notifications.test.js','results-notifications.test.js'];
for(const file of files)await withPgFixture(async({connectionString})=>{
 const admin=new pg.Pool({connectionString,max:1});
 try{await migrateFoundation(admin,{ownedSyntheticDatabase:true});}finally{await admin.end();}
 assertTap(run(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',resolve(root,'g1-recovery/node_modules/.cache/recovery-build/g1-recovery/tests',file)],resolve(root,'g1-recovery'),{...process.env,RECOVERY_DATABASE_URL:connectionString}));
});
