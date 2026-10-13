import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,lstatSync,copyFileSync,rmSync,cpSync,readlinkSync,realpathSync } from 'node:fs';
import { resolve,dirname,relative,join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID,createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
export const digest=(bytes:string|Buffer)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export const repository=resolve('g1-storage','..');
export const packageRoot=resolve(repository,'g1-storage');
// The runner imports this reproducible F05 allocation outside the package.
// Include its exact bytes so hostile copies reach their intended build gates.
const fixtureInputs:Record<string,string>={
 'docs/loop/agent-fabric-g1-f05-storage/plan-turn88/repair-cases.json':'2bd2348ce60cf11ff37a1370cad7c7dfff3a3bd29f63ac434125080b1efce872'
};
export type ChildResult=ReturnType<typeof spawnSync> & {stdout:string;stderr:string};
/** F-H owns only regular, reproducible copies. No sibling install or cache is
 * linked into the child. All accepted inputs are copied and rehashed again. */
export class HarnessCopy {
 readonly directory=mkdtempSync(join(tmpdir(),'fabric-storage-harness-'));
 readonly owner=randomUUID();
 readonly root=resolve(this.directory,'candidate');
 readonly storage=resolve(this.root,'g1-storage');
 readonly cache=resolve(this.storage,'node_modules/.cache/storage-build');
 private readonly inputs:Record<string,string>;
 constructor(dependencies=true){
  writeFileSync(resolve(this.directory,'owner'),this.owner,{flag:'wx',mode:0o600});
  this.inputs=JSON.parse(readFileSync(resolve(packageRoot,'verification/preserved-inputs.json'),'utf8')).files;
  try{
  for(const [name,hash] of Object.entries({...this.inputs,...fixtureInputs})){
   assert.equal(digest(readFileSync(resolve(repository,name))).slice(7),hash,name);
   this.copy(resolve(repository,name),resolve(this.root,name));
  }
  const walk=(directory:string)=>{for(const name of readdirSync(directory).sort()){
   if(name==='node_modules')continue;
   const source=resolve(directory,name),s=lstatSync(source);assert.equal(s.isSymbolicLink(),false);
   if(s.isDirectory())walk(source);else this.copy(source,resolve(this.storage,relative(packageRoot,source)));
  }};walk(packageRoot);
  // Reuse verified installed bytes in a private copy. The global offline store
  // is incomplete; no network fetch, shared symlink or install bypass is used.
  if(dependencies)for(const owner of ['g1-storage','g1-recovery']){
   const installed=resolve(repository,owner,'node_modules');
   const inspect=(directory:string)=>{for(const name of readdirSync(directory)){
    if(name==='.cache')continue;const path=resolve(directory,name),s=lstatSync(path);
    if(s.isSymbolicLink()){assert.equal(readlinkSync(path).startsWith('/'),false);assert.ok(realpathSync(path).startsWith(installed+'/'));}
    else if(s.isDirectory())inspect(path);
   }};inspect(installed);
   cpSync(installed,resolve(this.root,owner,'node_modules'),{recursive:true,verbatimSymlinks:true,mode:constants.COPYFILE_FICLONE,filter:path=>!relative(installed,path).split('/').includes('.cache')});
  }
  this.put('node_modules/.cache/sibling-sentinel','sibling-'+this.owner,true);
  }catch(error){
   try{this.removeOwned();}catch(cleanup){throw new AggregateError([error,cleanup],'F-H setup and owned cleanup failed');}throw error;
  }
 }
 private copy(source:string,target:string){assert.equal(lstatSync(source).isFile(),true);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);assert.deepEqual(readFileSync(target),readFileSync(source));}
 put(name:string,body:string,atRoot=false){const path=resolve(atRoot?this.root:this.storage,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,body);return path;}
 run(label:string,script:string,args:string[]=[]):ChildResult{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  // Strip live outer fixture capabilities from this compiler/result-only copy.
  for(const key of Object.keys(env))if(key.startsWith('STORAGE_')||key.startsWith('MODEL_')||key.startsWith('IDENTITY_'))delete env[key];
  const result=spawnSync(process.execPath,[resolve(this.storage,script),...args],{cwd:this.root,env,encoding:'utf8',timeout:120_000,maxBuffer:32*1024*1024}) as ChildResult;
  assert.equal(typeof result.stdout,'string');assert.equal(typeof result.stderr,'string');
  console.log(JSON.stringify({measurement:'harness-child-result',label,owner:this.owner,script,args,status:result.status,signal:result.signal,error:result.error?.message??null,
   stdoutBase64:Buffer.from(result.stdout).toString('base64'),stderrBase64:Buffer.from(result.stderr).toString('base64'),stdoutBytes:Buffer.byteLength(result.stdout),stderrBytes:Buffer.byteLength(result.stderr),stdoutSha256:digest(result.stdout),stderrSha256:digest(result.stderr)}));
  assert.equal(result.error,undefined);assert.equal(result.signal,null);return result;
 }
 private removeOwned(){
  assert.equal(lstatSync(this.directory).isSymbolicLink(),false);assert.equal(readFileSync(resolve(this.directory,'owner'),'utf8'),this.owner);
  rmSync(this.directory,{recursive:true});assert.equal(exists(this.directory),false);
 }
 close(){
  assert.equal(readFileSync(resolve(this.root,'node_modules/.cache/sibling-sentinel'),'utf8'),'sibling-'+this.owner);
  for(const [name,hash] of Object.entries({...this.inputs,...fixtureInputs}))for(const root of [repository,this.root])assert.equal(digest(readFileSync(resolve(root,name))).slice(7),hash,name);
  this.removeOwned();
  console.log(JSON.stringify({measurement:'harness-copy-cleanup',owner:this.owner,removed:true,protectedInputs:Object.keys(this.inputs).length,fixtureInputs:Object.keys(fixtureInputs).length,siblingPreserved:true}));
 }
}
function exists(path:string){try{lstatSync(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return false;}}
