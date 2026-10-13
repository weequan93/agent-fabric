import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,openSync,closeSync,fsyncSync,renameSync,lstatSync,realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash,createRoot,assertPrivateFile,observeRoot } from './ownership.mjs';
export function durableFile(path,bytes){
 writeFileSync(path,bytes,{mode:0o600,flag:'wx'});const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
}
function syncDir(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function locator(candidate){return '/private/tmp/agent-fabric-recovery-current-'+process.getuid()+'-'+candidate.digest.slice(7)+'.json';}
function replaceLocator(candidate,value){
 const path=locator(candidate);
 if(lstatSync(path,{throwIfNoEntry:false})){
  assertPrivateFile(path);const old=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(old.candidate,candidate.digest);assert.equal(old.ownerUid,process.getuid());
 }
 const temporary=path+'.'+randomUUID();durableFile(temporary,JSON.stringify(value)+'\n');renameSync(temporary,path);syncDir('/private/tmp');
}
export function beginJournal(candidate){
 const journal=createRoot('/private/tmp/agent-fabric-owned-recovery-'),runId=randomUUID();
 assert.equal(lstatSync(journal.path).mode&0o777,0o700);assert.equal(realpathSync(journal.path),journal.path);
 const markerFd=openSync(resolve(journal.path,'.storage-owner.json'),'r');try{fsyncSync(markerFd);}finally{closeSync(markerFd);}
 syncDir(journal.path);
 const pointer={schemaVersion:1,status:'running',candidate:candidate.digest,ownerUid:process.getuid(),runId,
  journal:journal.path,identity:journal.identity,receiptDigest:null};
 replaceLocator(candidate,pointer);
 return {journal,runId,pointer};
}
export function finishJournal(candidate,control,receipt){
 assert.equal(observeRoot(control.journal.path,control.journal.identity).state,'owned');
 const bytes=JSON.stringify(receipt)+'\n';durableFile(resolve(control.journal.path,'receipt.json'),bytes);syncDir(control.journal.path);
 replaceLocator(candidate,{...control.pointer,status:'complete',receiptDigest:hash(bytes)});
 return {path:resolve(control.journal.path,'receipt.json'),bytes:Buffer.byteLength(bytes),sha256:hash(bytes)};
}
export function failJournal(candidate,control){replaceLocator(candidate,{...control.pointer,status:'failed'});}
export function readJournal(candidate,schema){
 const path=locator(candidate);assertPrivateFile(path);const pointer=JSON.parse(readFileSync(path,'utf8'));
 assert.deepEqual(Object.keys(pointer).sort(),['schemaVersion','status','candidate','ownerUid','runId','journal','identity','receiptDigest'].sort());
 assert.equal(pointer.schemaVersion,1);assert.equal(pointer.status,'complete');assert.equal(pointer.candidate,candidate.digest);assert.equal(pointer.ownerUid,process.getuid());
 assert(pointer.journal.startsWith('/private/tmp/agent-fabric-owned-recovery-'));
 assert.equal(observeRoot(pointer.journal,pointer.identity).state,'owned');
 assert.equal(lstatSync(pointer.journal).mode&0o777,0o700);assert.equal(lstatSync(pointer.journal).uid,process.getuid());
 const receiptPath=resolve(pointer.journal,'receipt.json');assertPrivateFile(receiptPath);const bytes=readFileSync(receiptPath);
 assert.equal(hash(bytes),pointer.receiptDigest);const receipt=schema.RecoveryJournalSchema.parse(JSON.parse(bytes));
 assert.deepEqual(receipt.candidate,candidate);assert.equal(receipt.runId,pointer.runId);assert.equal(receipt.journal.path,pointer.journal);
 assert.deepEqual(receipt.journal.identity,pointer.identity);
 assert(Date.now()-Date.parse(receipt.createdAt)>=0&&Date.now()-Date.parse(receipt.createdAt)<600_000,'Fresh paired recovery check receipt required');
 for(const stream of receipt.streams){
  assert.equal(stream.path,resolve(pointer.journal,stream.path.endsWith('/stdout.log')?'stdout.log':'stderr.log'));
  assertPrivateFile(stream.path);const b=readFileSync(stream.path);assert.equal(b.length,stream.bytes);assert.equal(hash(b),stream.sha256);
 }
 return {receipt,receiptIndex:{path:receiptPath,bytes:bytes.length,sha256:hash(bytes)}};
}
