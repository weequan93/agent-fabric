import { spawnSync } from 'node:child_process';
import { createHash,randomUUID } from 'node:crypto';
import { lstatSync,readFileSync,writeFileSync,mkdtempSync,rmSync,realpathSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { root,cache,postgresImage } from '../paths.mjs';
import { assertContainerOwned,assertRootOwned } from '../fixture.mjs';

export const hash=value=>'sha256:'+createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const now=()=>new Date().toISOString();
export const ownerLabel='agent-fabric.storage-fixture-owner';
export function command(executable,args,timeout=30_000){
 const r=spawnSync(executable,args,{encoding:'utf8',timeout,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH,LC_ALL:'C'}});
 if(r.error||r.signal!==null||r.status!==0)throw new Error('Recovery command failed: '+executable+' '+args[0]+' ('+(r.error?.code??r.signal??r.status)+')');
 return r.stdout.trim();
}
export const docker=args=>command('docker',args);
export const containers=()=>docker(['ps','-a','--no-trunc','--filter','label='+ownerLabel,'--format','{{.ID}}']).split('\n').filter(Boolean).sort();
const allContainers=()=>docker(['ps','-a','--no-trunc','--format','{{.ID}}']).split('\n').filter(Boolean).sort();
function inspect(key){
 const r=spawnSync('docker',['inspect',key],{encoding:'utf8',timeout:30_000,maxBuffer:2*1024*1024});
 if(r.error||r.signal!==null)throw new Error('Exact container inspection unavailable');
 if(r.status!==0){
  const missing=['error: no such object: '+key,'Error response from daemon: No such object: '+key,'Error response from daemon: No such container: '+key];
  if(r.status!==1||r.stdout.trim()!=='[]'||!missing.includes(r.stderr.trim()))throw new Error('Container absence not proven');
  return null;
 }
 const rows=JSON.parse(r.stdout);assert.equal(rows.length,1);return rows[0];
}
export function observeContainer(expected,{database=true}={}){
 const info=inspect(expected.id),named=inspect(expected.name),ids=allContainers();
 const value={kind:'container',observedAt:now(),state:'absent',id:expected.id,name:expected.name,
  owner:info?.Config?.Labels?.[ownerLabel]??null,instance:info?.Config?.Labels?.['agent-fabric.storage-fixture-instance']??null,
  image:info?.Config?.Image??null,inspectDigest:info?hash(info):null,
  loopback:false,bindMounts:info?.Mounts?.filter(m=>m.Type==='bind').length??0,
  databaseOwner:null,databaseInstance:null,databaseVerified:false,refusal:null};
 if(!info&&!named&&!ids.includes(expected.id))return value;
 try{
  assert(info&&named&&ids.includes(expected.id),'Current ID and name must both resolve');
  assert.equal(named.Id,expected.id,'Name substitution');
  assertContainerOwned(info,expected.owner,expected.instance,expected.name,expected.id);
  value.loopback=true;
  if(database){
   const rows=docker(['exec',expected.id,'psql','-X','-U','postgres','-d','storage_test','-A','-t','-c','SELECT owner,instance FROM public.fabric_storage_fixture']);
   assert.equal(rows,expected.owner+'|'+expected.instance,'Current database ownership marker');
   [value.databaseOwner,value.databaseInstance]=rows.split('|');value.databaseVerified=true;
  }
  value.state='owned';
 }catch{value.state='refused';value.refusal='Current container ownership/instance/image/name/loopback/mount/database proof refused';}
 return value;
}
export function removeContainer(expected,options){
 const before=observeContainer(expected,options);
 if(before.state==='refused')return {action:'refused',before,after:observeContainer(expected,options),signals:[],refusal:before.refusal};
 if(before.state==='absent')return {action:'already-absent',before,after:observeContainer(expected,options),signals:[],refusal:null};
 // No historical ID authority: complete fresh proof again immediately before rm.
 assert.equal(observeContainer(expected,options).state,'owned');
 console.log(JSON.stringify({measurement:'recovery-container-before-action',observation:before}));
 docker(['rm','--force','--volumes',expected.id]);
 const after=observeContainer(expected,options);assert.equal(after.state,'absent');
 console.log(JSON.stringify({measurement:'recovery-container-after-action',observation:after}));
 return {action:'removed',before,after,signals:[],refusal:null};
}
export function createRoot(prefix='/private/tmp/agent-fabric-recovery-probe-'){
 const path=mkdtempSync(prefix,{encoding:'utf8'}),s=lstatSync(path);
 const identity={owner:randomUUID(),instance:randomUUID(),rootId:randomUUID(),device:s.dev,inode:s.ino};
 writeFileSync(resolve(path,'.storage-owner.json'),JSON.stringify(identity),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({measurement:'recovery-root-created',path,identity}));
 return {path,identity};
}
export function assertPrivateFile(path){
 const s=lstatSync(path);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600);
 assert.equal(realpathSync(path),path);return s;
}
export function observeRoot(path,expected){
 const value={kind:'root',observedAt:now(),state:'absent',path,device:null,inode:null,symlink:false,markerDigest:null,expected,refusal:null};
 const s=lstatSync(path,{throwIfNoEntry:false});
 if(!s){
  // If the parent exists it too must resolve without a symlink substitution.
  if(lstatSync(dirname(path),{throwIfNoEntry:false}))assert.equal(realpathSync(dirname(path)),dirname(path));
  return value;
 }
 value.device=s.dev;value.inode=s.ino;value.symlink=s.isSymbolicLink();
 try{
  assert.equal(realpathSync(dirname(path)),dirname(path));
  assertRootOwned(path,expected);assertPrivateFile(resolve(path,'.storage-owner.json'));
  value.markerDigest=hash(readFileSync(resolve(path,'.storage-owner.json')));value.state='owned';
 }catch{value.state='refused';value.refusal='Current root marker/device/inode/realpath/symlink proof refused';}
 return value;
}
export function removeRoot(path,expected,children=[]){
 const before=observeRoot(path,expected);
 const childObservations=children.map(c=>observeRoot(c.path,c.identity));
 if(before.state==='refused'||childObservations.some(c=>c.state==='refused'))return {action:'refused',before,after:observeRoot(path,expected),signals:[],refusal:'Parent or child root proof refused'};
 if(before.state==='absent'){
  assert(childObservations.every(c=>c.state==='absent'));
  return {action:'already-absent',before,after:observeRoot(path,expected),signals:[],refusal:null};
 }
 assert.equal(observeRoot(path,expected).state,'owned');
 for(const child of children)assert.notEqual(observeRoot(child.path,child.identity).state,'refused');
 assertRootOwned(path,expected);
 console.log(JSON.stringify({measurement:'recovery-root-before-action',observation:before,children:childObservations}));
 rmSync(path,{recursive:true});const after=observeRoot(path,expected);assert.equal(after.state,'absent');
 console.log(JSON.stringify({measurement:'recovery-root-after-action',observation:after}));
 return {action:'removed',before,after,signals:[],refusal:null};
}
export async function processTools(){return import(pathToFileURL(resolve(cache,'g1-model/tests/helpers/process-fixture.js')).href);}
export async function processCensus(){const {census}=await processTools();return census();}
export function observeProcessRows(expected,rows){
 const row=rows.find(r=>r.pid===expected.pid),parent=rows.find(r=>r.pid===expected.parentPid);
 const value={kind:'process',observedAt:now(),state:'absent',pid:expected.pid,ppid:row?.ppid??null,
  instance:row?.instance??null,commandDigest:row?hash(row.command):null,
  expectedCommand:expected.command,expectedInstance:expected.instance,commandMatches:row?.command===expected.command,nonce:expected.nonce,
  originalParentPid:expected.parentPid,originalParentPresent:!!parent,
  censusDigest:hash(rows.map(r=>({...r,command:hash(r.command)}))),refusal:null};
 if(!row){
  // An identical nonce under a different PID is also a substitution, not absence.
  if(rows.some(r=>r.command.includes(expected.nonce))){value.state='refused';value.refusal='Expected nonce under substituted PID';}
  return value;
 }
 const parentMatches=expected.mode==='direct'
  ?row.ppid===expected.parentPid&&expected.parentPid===process.pid&&parent?.instance===expected.parentInstance
  :!parent&&row.ppid===1;
 if(row.instance!==expected.instance||row.command!==expected.command||!row.command.endsWith(' '+expected.nonce)
  ||!parentMatches||rows.some(r=>r.ppid===row.pid)){
  value.state='refused';value.refusal='Current PID/birth/command/nonce/original-parent/descendant proof refused';
 }else value.state='owned';
 return value;
}
export const observeProcess=async expected=>observeProcessRows(expected,await processCensus());
export async function removeProcess(expected){
 const before=await observeProcess(expected);
 if(before.state==='refused')return {action:'refused',before,after:await observeProcess(expected),signals:[],refusal:before.refusal};
 if(before.state==='absent')return {action:'already-absent',before,after:await observeProcess(expected),signals:[],refusal:null};
 assert.equal((await observeProcess(expected)).state,'owned');
 console.log(JSON.stringify({measurement:'recovery-process-before-action',observation:before}));
 process.kill(expected.pid,'SIGTERM');
 const {waitUntil}=await processTools();
 // A timeout remains a failure; a subsequent turn must prove ownership afresh.
 await waitUntil(async()=>!(await processCensus()).some(r=>r.pid===expected.pid),'exact recovery process absence',5000);
 const after=await observeProcess(expected);assert.equal(after.state,'absent');
 console.log(JSON.stringify({measurement:'recovery-process-after-action',observation:after}));
 return {action:'removed',before,after,signals:['SIGTERM'],refusal:null};
}
export async function freshExpected(owned){
 const rows=await processCensus(),parent=rows.find(r=>r.pid===process.pid);assert(parent);
 return {pid:owned.pid,nonce:owned.marker,instance:owned.identity.instance,command:owned.identity.command,
  parentPid:process.pid,parentInstance:parent.instance,mode:'direct'};
}
export function assertRecoveryPins(){
 const pins=JSON.parse(readFileSync(resolve(root,'g1-storage/verification/owned-recovery-pins.json'),'utf8'));
 assert.equal(pins.schemaVersion,1);assert.equal(Object.keys(pins.files).length,14);
 return Object.entries(pins.files).map(([path,sha256])=>{
  assert.equal(hash(readFileSync(resolve(root,path))),'sha256:'+sha256,'Unchanged recovery prerequisite: '+path);
  return {path,sha256:'sha256:'+sha256};
 });
}
