import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,mkdirSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
export const cwd=fileURLToPath(new URL('../',import.meta.url)),root=resolve(cwd,'..');
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function run(command,args,options={}) {
 const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60_000,maxBuffer:16*1024*1024,...options});
 if(result.error||result.status!==0)throw new Error(JSON.stringify({command,args,status:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr}));
 return result;
}
export function assertBaseline() {
 const baseline=JSON.parse(readFileSync(join(cwd,'verification/inherited-files.json'),'utf8'));
 if(baseline.schemaVersion!==1||Object.keys(baseline.files).length<3700)throw new Error('Inherited preservation inventory absent');
 assertPreserved(root,baseline.files);
 return Object.keys(baseline.files).length;
}
export function assertPreserved(base,files){
 for(const [path,digest]of Object.entries(files))if(path.startsWith('/')||path.split('/').includes('..')||path.startsWith('g1-runtime/')||sha(readFileSync(join(base,path)))!==digest)throw new Error('Inherited source/raw/F05 changed: '+path);
}
export function compileCurrent(packageRoot,output){
 const config=JSON.parse(readFileSync(join(packageRoot,'tsconfig.json'),'utf8')),o=config.compilerOptions;
 for(const flag of ['strict','noUncheckedIndexedAccess','exactOptionalPropertyTypes','useUnknownInCatchVariables','forceConsistentCasingInFileNames','noEmitOnError'])if(o[flag]!==true)throw new Error('Strict flag missing: '+flag);
 if(o.skipLibCheck!==false||o.module!=='NodeNext'||o.target!=='ES2023'||o.rootDir!=='..'||!config.include.includes('src/**/*.ts')||!config.include.includes('tests/**/*.ts'))throw new Error('Source AND test compiler boundary changed');
 return run(process.execPath,[join(cwd,'node_modules/typescript/bin/tsc'),'-p',join(packageRoot,'tsconfig.json'),'--outDir',output],{cwd:packageRoot});
}
export function assertEmission(paths){for(const path of paths)if(!lstatSync(path).isFile())throw new Error('Current emission missing: '+path);}
function directory(path) {
 try{const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Unsafe cache parent: '+path);}
 catch(e){if(e.code!=='ENOENT')throw e;mkdirSync(path);}
}
export function ownedDirectory(prefix='runtime-') {
 for(const p of ['node_modules','node_modules/.cache'])directory(join(cwd,p));
 const path=mkdtempSync(join(cwd,'node_modules/.cache',prefix)),nonce=randomUUID();
 const marker=join(path,'.runtime-owner.json');writeFileSync(marker,JSON.stringify({nonce,path}),{flag:'wx'});
 const stat=lstatSync(path),markerStat=lstatSync(marker);
 return {path,nonce,cleanup(){
  for(const p of ['node_modules','node_modules/.cache'])directory(join(cwd,p));
  const current=lstatSync(path),currentMarker=lstatSync(marker);
  if(current.isSymbolicLink()||current.dev!==stat.dev||current.ino!==stat.ino||!currentMarker.isFile()||currentMarker.isSymbolicLink()||currentMarker.dev!==markerStat.dev||currentMarker.ino!==markerStat.ino)throw new Error('Ambiguous cache ownership; retained');
  const owner=JSON.parse(readFileSync(marker,'utf8'));
  if(owner.path!==path||owner.nonce!==nonce)throw new Error('Ambiguous cache ownership; retained');
  rmSync(path,{recursive:true});
 }};
}
export function candidate(packageRoot=cwd) {
 const files=['package.json','pnpm-lock.yaml','tsconfig.json'];
 function walk(dir){for(const e of readdirSync(join(packageRoot,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(e.isSymbolicLink())throw new Error('Candidate symlink refused');const path=dir+'/'+e.name;if(e.isDirectory())walk(path);else if(e.isFile())files.push(path);}}
 for(const dir of ['src','tests','scripts','verification','migrations'])walk(dir);
 return {digest:'sha256:'+sha(JSON.stringify(files.map(p=>[p,sha(readFileSync(join(packageRoot,p)))]))),files};
}
export function assertCandidate(expected,packageRoot=cwd){if(candidate(packageRoot).digest!==expected)throw new Error('Candidate changed after current build');}
export function build() {
 const preserved=assertBaseline();
 if(process.version!=='v22.22.3'||run('pnpm',['--version']).stdout.trim()!=='10.18.0')throw new Error('Pinned Node/pnpm required');
 const pkg=JSON.parse(readFileSync(join(cwd,'package.json'),'utf8'));
 if(sha(readFileSync(join(cwd,'pnpm-lock.yaml')))!=='ca42a644c6d09dd16500bb4b7d2f1a5885bb796e4660b3ac974bdb68a2c37ec4')throw new Error('Frozen dependency lock changed');
 const pins={pg:'8.16.3','@types/node':'22.18.6','@types/pg':'8.15.5',typescript:'5.9.3'};
 if(pkg.packageManager!=='pnpm@10.18.0'||pkg.engines.node!=='22.22.3'||pkg.engines.pnpm!=='10.18.0'||JSON.stringify({...pkg.dependencies,...pkg.devDependencies})!==JSON.stringify(pins))throw new Error('Dependency pins changed');
 for(const p of ['node_modules','node_modules/.cache'])directory(join(cwd,p));
 run('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'],{timeout:30_000,env:{...process.env,CI:'true'}});
 for(const [name,version]of Object.entries(pins))if(JSON.parse(readFileSync(join(cwd,'node_modules',name,'package.json'),'utf8')).version!==version)throw new Error('Installed pin mismatch: '+name);
 const own=ownedDirectory('runtime-build-'),before=candidate();
 try {
  // Never reuse stale JS. Emission is nonce-owned and noEmitOnError is mandatory.
  compileCurrent(cwd,own.path);
  assertEmission(['g1-runtime/src/contracts.js','g1-runtime/src/schemas.js','g1-runtime/src/owners.js','g1-runtime/tests/contracts.test.js','g1-recovery/src/contracts.js','g1-foundations/src/contracts.js'].map(p=>join(own.path,p)));
  if(candidate().digest!==before.digest)throw new Error('Candidate changed during build');
  assertBaseline();
  return {...own,candidate:before.digest,metadata:{sourceAndTests:true,strict:true,exactOptionalPropertyTypes:true,preservedFiles:preserved,pins,install:'offline/frozen/ignore-scripts',cache:own.path,candidate:before.digest}};
 }catch(e){own.cleanup();throw e;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==2)throw new Error('Build accepts no arguments');
 const result=build();console.log(JSON.stringify(result.metadata));
}
