import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const cwd=fileURLToPath(new URL('../',import.meta.url)),root=resolve(cwd,'..');
const preserved={
  "g1-foundations/evidence/retained-raw/00-b406094d700440b2990acbd32b3036bd-stdout.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "g1-foundations/evidence/retained-raw/01-b406094d700440b2990acbd32b3036bd-stderr.txt": "6db0ae2a4c7965e9acf4db31cce0fd844287657ef73743a121f62a9367561c0a",
  "g1-foundations/evidence/retained-raw/02-c951d8b04ebe4625b0df41cbd59c37bd-stdout.txt": "1bb97a410ce9ca5c55e628d73e85586826a35afd415d171d59bc05a7efe00dc7",
  "g1-foundations/evidence/retained-raw/03-c951d8b04ebe4625b0df41cbd59c37bd-stderr.txt": "84be3c972d6d1beb861c21356efb62683cbd4b75ae6083fb749a6bea5384da29",
  "g1-foundations/evidence/retained-raw/04-83cf29c41a194f48b4f9e1529463cccc-stdout.txt": "ff8c90bf995271a15aa84441d0e61750c61219807597a8b03833133a74777d66",
  "g1-foundations/evidence/retained-raw/05-83cf29c41a194f48b4f9e1529463cccc-stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "g1-foundations/evidence/retained-raw/06-9b86ed079adc41c4a375eafed79661a4-stdout.txt": "30d34a218e5e4fa960dcb0be44ba0b18265d7a65152b220db1875ea6f9d3de85",
  "g1-foundations/evidence/retained-raw/07-9b86ed079adc41c4a375eafed79661a4-stderr.txt": "4a7777a051382a89ff757bb85c642c3d533242aaf4aab4151b8985e557b4406d",
  "g1-foundations/evidence/retained-raw/08-verification-cdece9fc958f491aaf3ba6514927b62a-atmeugei-pg-capability-supplement.log": "4f44ef663b2ec11a6837e13b39e2c08eb4f266d9da14cb23710e3f738f039c14",
  "g1-foundations/evidence/retained-raw/09-verification-cdece9fc958f491aaf3ba6514927b62a-atmeugei-pg-rls-uow.log": "7c3c5e07d88fecf51c61142b7971d3907899989577977bf2b59c0eb389aa27f4",
  "g1-foundations/evidence/retained-raw/10-verification-cdece9fc958f491aaf3ba6514927b62a-atmeugei-remote-system-smoke.log": "4b4da6cf99246ee599cd31c0eaa5fd02ef4c401b32fd143ea87f5dbb4ce96033",
  "g1-foundations/evidence/retained-raw/11-verification-e75384ac483b49a88ac1618c71a36062-qwmakg6d-pg-capability.log": "bd90c81672c645e937d74dcb91b3a8fbedfa341120a6a16a05f1d8292a340503",
  "g1-foundations/evidence/retained-raw/12-verification-e75384ac483b49a88ac1618c71a36062-qwmakg6d-pg-rls-uow.log": "cdd3076af2af625e6aced46fbef9f4fd6f71aee7ce6d4b2d5c80575d1619510b",
  "g1-foundations/evidence/retained-raw/13-verification-dea5c3298f0c43d7892ac86c7665dc12-sifx3kiw-pg-capability.log": "81f2dd3cb144d288df088b89a93928a669a7f771f25ad067e21fda484acfd0db",
  "g1-foundations/evidence/retained-raw/final-r0-0a33f6268bac427ba5e9dc218adc3881-stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "g1-foundations/evidence/retained-raw/final-r0-0a33f6268bac427ba5e9dc218adc3881-stdout.txt": "0b3513936c668f9592a76a5fcc5ea19fdbf94cefe8f6d9474f0dc152b8f688b4",
  "g1-foundations/evidence/retained-raw/final-r0-4824c835e58f4ca18a278527d2b341d9-stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "g1-foundations/evidence/retained-raw/final-r0-4824c835e58f4ca18a278527d2b341d9-stdout.txt": "45d4620c2a8ff56d018e7238e093045138f3b52bfee618202fe38d688efb4b92",
  "g1-foundations/evidence/retained-raw/final-r0-82c8819daaf047f2a92f7d02aaed69db-stderr.txt": "45ca8b2dccf12e0700572c54845ff423e962d3a8fa82bc0c90ea19e86562581f",
  "g1-foundations/evidence/retained-raw/final-r0-82c8819daaf047f2a92f7d02aaed69db-stdout.txt": "16f4e4fdf14e773a26ab64afb4b491354dcaacb9b009d9ada12e618b0c99c522",
  "g1-foundations/evidence/retained-raw/final-r0-970d41f619494d1dbe557ed99651f86f-stderr.txt": "527e974f8818cf37dc813444d7d860e78fd6dbdae06d59da1770c34cb35dc024",
  "g1-foundations/evidence/retained-raw/final-r0-970d41f619494d1dbe557ed99651f86f-stdout.txt": "862c292c474b76fb7abc93a71c54806caff84e3e691155b49e35c2ed68c638d6",
  "g1-foundations/evidence/retained-raw/manifest.json": "59b317e5e9032a18e7105cc3c6bd04a60f98ff6834d9b618e0c45462947ade55",
  "g1-foundations/evidence/retained-raw/security-r0-raw-review.json": "62ad52fbfa1a3b6b4f31b2a427504542fdf6c4d3f74c03245c7268fc6d15dbee",
  "g1-foundations/evidence/retained-raw/security-r1-findings.json": "823daa6aec9b3926476a62d5be9c372d3c53144f11c2ac61e45217fbd178c731",
  "g1-foundations/migrations/0002_controller_roles.sql": "2f40417a2b7f3544a64e7c57dcc7e84006a29e3f49458363f6ba553bd8361569",
  "g1-foundations/package.json": "3d6839d2b01c6adcdb0d912a1787f69027c13968a44bf7b31b37f7ae7ca1ff98",
  "g1-foundations/pnpm-lock.yaml": "ca42a644c6d09dd16500bb4b7d2f1a5885bb796e4660b3ac974bdb68a2c37ec4",
  "g1-foundations/scripts/build.mjs": "87de4b61735fede005d8a979cb8c1dc45501f720cd6d59f3fe4d53131e2560d4",
  "g1-foundations/scripts/check-retained.mjs": "de5b163372523bf1699f6224fb8b17338a02ced1045a1f9fdec2b4d1efe40228",
  "g1-foundations/scripts/check.mjs": "58f63d59330832e3311adf191bb3f8eff24912d3b563bf6bb8a7079918694ce4",
  "g1-foundations/scripts/pg-fixture.mjs": "d5fa37f3ed35285bf8781bfd7907914d9bd16363194613783b92ad0a159f780a",
  "g1-foundations/scripts/remote-probe.mjs": "38d90f9e3b79c6c8177392b63273fe3ff4a3760a2203d3a3cc48b082df74d716",
  "g1-foundations/src/contracts.ts": "aeda217ba540cc59864fcffffb6d8541fd3a4c2ab113edd861141096ee18da65",
  "g1-foundations/src/migration.ts": "0f167b32a719ad669d4fe98de0fe8d95e8e122b85793795b75ea2ac09c3dd5fb",
  "g1-foundations/src/outbox.ts": "7a125cf717168437fde9fb466ec192343ae5904a76de4336df1aa99ed6253edf",
  "g1-foundations/src/postgres-uow.ts": "d7981128f1adcd7e4bccf76e6d871db9b9a0f015205d76abbb1fd2007ebf0f79",
  "g1-foundations/src/profile.ts": "73d53c5adb4786562367f4bf4c807b2448d6278955d0183cc428ec950d80db41",
  "g1-foundations/src/task-repository.ts": "698251b9002d94ce57bf783dee01eab3afd150de2cf8311a7399f1c80e70d3ee",
  "g1-foundations/tests/contracts.test.ts": "e69585d45f24f18678db44219932b2b2624a07e88eb07dac744513dcefe3e7c5",
  "g1-foundations/tests/postgres.test.ts": "cdcc19f3e0bd164d958c75d15ec18863709f59e7912b22bbc51625826abc7083",
  "g1-foundations/tsconfig.json": "be661cf11292103ef493ccb83c27ef3f5923282961a66f0da6356d455064a0fa"
};
function assertBaseline(){for(const [path,sha] of Object.entries(preserved))if(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')!==sha)throw new Error('Accepted foundation baseline changed: '+path);console.log('foundation-source-hashes: '+Object.keys(preserved).length+' accepted files unchanged');}
function run(command,args,workdir=cwd,env=process.env,timeout=60000){const r=spawnSync(command,args,{cwd:workdir,env,encoding:'utf8',timeout,maxBuffer:16*1024*1024});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.error||r.status!==0)throw r.error??new Error(command+' failed '+r.status);return r.stdout;}
/** Actual environment/cleanup gate before builds or product checks; cached fixture dependencies only. */
async function runtimePreflight(){
 if(process.version!=='v22.22.3')throw new Error('Pinned Node22.22.3 required');
 const census=spawnSync('ps',['-axo','pid=,ppid=,pgid=,lstart=,comm='],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:2*1024*1024});
 if(census.error||census.status!==0)throw new Error('Actual process census unavailable ('+(census.error?.code??'exit '+census.status)+'); do not signal retained group IDs');
 const lines=census.stdout.trim().split('\n');const current=lines.find(line=>Number(line.trim().split(/\s+/)[0])===process.pid);
 if(!current)throw new Error('Current preflight process instance missing from census');
 console.log(JSON.stringify({measurement:'runtime-process-census',observedAt:new Date().toISOString(),processCount:lines.length,currentInstance:current.trim(),historicalGroupsSignalled:false}));
 const server=createServer((_request,response)=>response.end('synthetic-preflight'));
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address!=='object')throw new Error('Actual loopback address unavailable');const response=await fetch('http://127.0.0.1:'+address.port,{signal:AbortSignal.timeout(2000)});if(response.status!==200||await response.text()!=='synthetic-preflight')throw new Error('Actual loopback roundtrip failed');}
 finally{if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 console.log(JSON.stringify({measurement:'runtime-loopback-owned-cleanup',roundtrip:true,listenerClosed:true}));
 const child=spawn(process.execPath,['-e','process.stdout.write("ready\\n");setInterval(()=>{},1000)'],{cwd:root,stdio:['ignore','pipe','pipe']});
 const identity=()=>{const result=spawnSync('ps',['-p',String(child.pid),'-o','lstart=','-o','pgid='],{encoding:'utf8',timeout:2000,env:{...process.env,LC_ALL:'C'}});if(result.error||result.status!==0||!result.stdout.trim())throw new Error('Owned child instance cannot be observed');return result.stdout.trim();};
 let ownedIdentity;
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned child readiness timeout')),2000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.stdout.once('data',()=>{clearTimeout(timer);resolve();});});ownedIdentity=identity();if(identity()!==ownedIdentity)throw new Error('Owned child instance changed before cleanup');child.kill('SIGTERM');await new Promise((resolve,reject)=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();const timer=setTimeout(()=>reject(new Error('Owned child cleanup timeout')),2000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
 finally{if(child.exitCode===null&&child.signalCode===null){if(ownedIdentity&&identity()===ownedIdentity){child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));}else throw new Error('Unknown owned child effects; inspect original instance before retry');}}
 console.log(JSON.stringify({measurement:'runtime-owned-child-cleanup',pid:child.pid,instance:ownedIdentity,removed:true,historicalGroupsSignalled:false}));
 const image='postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333';
 run('docker',['image','inspect',image,'--format','{{.Id}}'],root,process.env,5000);
 const fixtureIds=()=>run('docker',['ps','-a','--filter','label=agent-fabric.foundation-fixture-owner','--format','{{.ID}}'],root,process.env,5000).trim().split('\n').filter(Boolean).sort();
 const before=fixtureIds();
 // Fresh controller snapshots intentionally omit node_modules. The accepted fixture
 // imports pg, so establish its frozen, offline, script-free dependencies first.
 run('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'],resolve(root,'g1-foundations'),process.env,15000);
 const {withPgFixture}=await import('../../g1-foundations/scripts/pg-fixture.mjs');
 await withPgFixture(async()=>{console.log(JSON.stringify({measurement:'runtime-pg-preflight',syntheticOnly:true,productTestsRun:false}));});
 const after=fixtureIds();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Owned fixture census changed; reconcile actual container IDs before costly checks');
 console.log(JSON.stringify({measurement:'runtime-cached-pg-owned-cleanup',preexistingFixtureIds:before,fixtureCensusPreserved:true,paidCallsAllowed:false}));
}
assertBaseline();
if(process.argv.slice(2).some(x=>x!=='--runtime-preflight'))throw new Error('Unknown identity check argument');
await runtimePreflight();
if(process.argv.includes('--runtime-preflight'))process.exit(0);
run('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store']);
run(process.execPath,['scripts/build.mjs'],resolve(root,'g1-foundations'));
run(process.execPath,['scripts/build.mjs']);
const testDir=resolve(cwd,'node_modules/.cache/identity-build/g1-identity/tests');
const tests=readdirSync(testDir).filter(x=>x.endsWith('.test.js')).sort();
for(const name of ['oidc-network.test.js','identity-postgres.test.js','approval-audience.test.js'])if(!tests.includes(name))throw new Error('Mandatory actual integration suite missing: '+name);
const {withPgFixture}=await import('../../g1-foundations/scripts/pg-fixture.mjs');
const {migrateFoundation}=await import('../../g1-foundations/node_modules/.cache/foundation-build/src/migration.js');
const pg=(await import('../node_modules/pg/lib/index.js')).default;
await withPgFixture(async ({connectionString})=>{
 const admin=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:2000});
 try{await migrateFoundation(admin,{ownedSyntheticDatabase:true});}finally{await admin.end();}
 const output=run(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...tests.map(x=>resolve(testDir,x))],root,{...process.env,IDENTITY_DATABASE_URL:connectionString},105000);
 if(!/^# tests [1-9]\d*$/m.test(output)||!/^ok \d+ - /m.test(output)||/^not ok \d+ - /m.test(output)||/^# (?:skipped|todo) [1-9]/m.test(output)||/^(?:ok|not ok) .*# (?:SKIP|TODO)/mi.test(output))throw new Error('Actual nonempty pass with no skips/TODO required');
 for(const label of ['OIDC/','IDENTITY/','APPROVAL/','AUDIENCE/'])if(!output.includes(label))throw new Error('Missing integration coverage '+label);
 const compatibility=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:2000});
 try{await migrateFoundation(compatibility,{ownedSyntheticDatabase:true});const versions=(await compatibility.query('SELECT version FROM public.fabric_foundation_migrations ORDER BY version')).rows.map(x=>x.version);if(JSON.stringify(versions)!=='[1,2]')throw new Error('Original foundation ledger must remain exactly1/2');console.log('original-foundation-migration-compatibility: versions1/2 unchanged after identity migration');}finally{await compatibility.end();}
});
assertBaseline();
console.log('G1-F02 local synthetic identity qualification only; paid model API OFF; formal SSO, human approval qualification, physical devices, signing, remote containment and full G1 remain pending.');
