// Durable failed-attempt evidence. A spool never qualifies a controller pass.
import assert from 'node:assert/strict';
import {constants,openSync,closeSync,writeFileSync,fsyncSync,fstatSync,lstatSync,mkdirSync} from 'node:fs';
import {resolve,parse,relative,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const errorData=e=>e==null?null:{name:String(e.name),message:String(e.message),stack:typeof e.stack==='string'?e.stack:null,code:e.code===undefined?null:String(e.code),errors:e instanceof AggregateError?e.errors.map(errorData):[]};
function ownedDirectory(path,identity){
 const s=lstatSync(path);assert(s.isDirectory()&&!s.isSymbolicLink(),'Owned native retention directory');
 assert.equal(s.uid,process.getuid(),'Native retention directory owner');
 if(identity){assert.equal(s.dev,identity.dev,'Native retention directory device');assert.equal(s.ino,identity.ino,'Native retention directory identity');}
 return {dev:s.dev,ino:s.ino};
}
function safeAncestors(path){
 const absolute=resolve(path),base=parse(absolute).root;let current=base;
 for(const part of relative(base,absolute).split(sep).filter(Boolean)){
  current=resolve(current,part);const s=lstatSync(current);
  assert(s.isDirectory()&&!s.isSymbolicLink(),'Native retention symlink ancestor refused');
 }
}
function syncDirectory(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(fd);}finally{closeSync(fd);}}
export function createNativeProofAttempt(base,candidate,retentionSourceDigest){
 assert.equal(typeof base,'string');assert.equal(resolve(base),base,'Absolute native retention base');
 assert.deepEqual(Object.keys(candidate),['digest','files']);assert.match(candidate.digest,/^sha256:[a-f0-9]{64}$/);
 assert(Number.isSafeInteger(candidate.files)&&candidate.files>0);assert.match(retentionSourceDigest,/^sha256:[a-f0-9]{64}$/);
 // Parent already belongs to the verifier. Do not recursively create through
 // symlinks or silently accept somebody else's existing evidence directory.
 const parent=resolve(base,'..');safeAncestors(parent);ownedDirectory(parent);
 try{mkdirSync(base,{mode:0o700});syncDirectory(parent);}catch(e){if(e.code!=='EEXIST')throw e;}
 safeAncestors(base);const baseIdentity=ownedDirectory(base),id=candidate.digest.slice(7)+'-'+randomUUID(),path=resolve(base,id);
 mkdirSync(path,{mode:0o700});syncDirectory(base);const identity=ownedDirectory(path);
 let index=0,phase='incomplete';const retained=[];
 function check(){safeAncestors(base);ownedDirectory(base,baseIdentity);ownedDirectory(path,identity);}
 function write(name,bytes){
  check();assert.match(name,/^[a-z0-9-]+\.(?:json|mjs|log)$/,'Fixed native retention relative name');
  assert(Buffer.isBuffer(bytes),'Actual native retention bytes');
  const file=resolve(path,name),fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{const s=fstatSync(fd);assert(s.isFile()&&s.nlink===1,'Exclusive native retention file');assert.equal(s.uid,process.getuid(),'Native retention file owner');writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  syncDirectory(path);return {bytes:bytes.length,digest:digest(bytes)};
 }
 const json=(name,value)=>write(name,Buffer.from(JSON.stringify(value)+'\n'));
 const binding={version:1,attempt:id,candidate:{...candidate},retentionSourceDigest,structuralOnly:true,productQualification:false};
 json('attempt.json',{...binding,phase});
 return Object.freeze({
  reference:{...binding,path},
  appendChild(child,result={}){
   assert.equal(phase,'incomplete','Children only before proof retention');
   assert(child&&child.structuralOnly===true&&child.productQualification===false,'Structural retained child');
   const number=index++,stem='child-'+String(number).padStart(6,'0'),channels={};
   for(const [key,extension] of [['source','mjs'],['stdout','log'],['stderr','log']]){
    const value=child[key];assert(typeof value==='string'||(key!=='source'&&(value===null||value===undefined)),'Original retained child '+key);
    channels[key]={available:typeof value==='string',representation:value===null?'null':typeof value,...write(stem+'-'+key+'.'+extension,Buffer.from(value??''))};
   }
   const {source,stdout,stderr,...metadata}=child;
   json(stem+'-metadata.json',{...binding,index:number,child:metadata,result:{error:errorData(result.error),signal:result.signal??null},channels});retained.push({metadata:JSON.stringify(metadata),channels});return number;
  },
  recordProof(proof){
   assert.equal(phase,'incomplete','Proof retained once');assert.equal(proof.structuralOnly,true);assert.equal(proof.productQualification,false);
   assert.deepEqual(proof.candidate,candidate,'Retained proof candidate');assert.equal(proof.nativeChildren.length,index,'Every native child durably retained');
   for(const [i,child] of proof.nativeChildren.entries()){
    const {source,stdout,stderr,...metadata}=child;assert.equal(JSON.stringify(metadata),retained[i].metadata,'Retained original child metadata');
    for(const [key,value] of Object.entries({source,stdout,stderr})){
     assert(typeof value==='string'||(key!=='source'&&(value===null||value===undefined)));const bytes=Buffer.from(value??'');
     assert.deepEqual({available:typeof value==='string',representation:value===null?'null':typeof value,bytes:bytes.length,digest:digest(bytes)},retained[i].channels[key],'Retained original child '+key);
    }
   }
   const raw=Buffer.from(JSON.stringify(proof)),record=write('proof.json',raw);
   json('proof-metadata.json',{...binding,phase:'proof-retained',children:index,raw:record});phase='proof-retained';return raw;
  },
  recordFailure(error,stage){
   assert.equal(typeof stage,'string');assert.match(stage,/^[a-z-]+$/);json('failure-'+stage+'.json',{...binding,phase,children:index,error:errorData(error)});
  },
  recordEmitted(receipt){
   assert.equal(phase,'proof-retained');json('emitted.json',{...binding,phase:'emitted-not-qualified',children:index,receipt});phase='emitted-not-qualified';
  }
 });
}
