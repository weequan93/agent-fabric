import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openSync,closeSync,fsyncSync,writeSync,readFileSync,lstatSync,renameSync,mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertPrivateFile,hash } from '../recovery/ownership.mjs';
import { assertRootOwned } from '../fixture.mjs';
import { durableFile } from '../recovery/journal.mjs';

export function syncDirectory(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
export function createJournal(candidate){
 const rootPath=mkdtempSync('/private/tmp/agent-fabric-custodian-'),stRoot=lstatSync(rootPath);
 const root={path:rootPath,identity:{owner:randomUUID(),instance:randomUUID(),rootId:randomUUID(),device:stRoot.dev,inode:stRoot.ino}},nonce=randomUUID();
 durableFile(resolve(rootPath,'.storage-owner.json'),JSON.stringify(root.identity));syncDirectory(rootPath);
 const path=resolve(root.path,'ownership.jsonl');
 durableFile(path,JSON.stringify({version:1,nonce,candidate,root})+'\n');syncDirectory(root.path);
 const st=assertPrivateFile(path);return {root,path,nonce,candidate,device:st.dev,inode:st.ino};
}
export function readJournal(j){
 assertRootOwned(j.root.path,j.root.identity);assert.equal(lstatSync(j.root.path).mode&0o777,0o700);
 assert.equal(lstatSync(j.root.path).uid,process.getuid());assertPrivateFile(resolve(j.root.path,'.storage-owner.json'));
 const st=assertPrivateFile(j.path);assert.equal(st.dev,j.device);assert.equal(st.ino,j.inode);
 const lines=readFileSync(j.path,'utf8').trimEnd().split('\n').map(x=>JSON.parse(x));
 assert.deepEqual(lines[0],{version:1,nonce:j.nonce,candidate:j.candidate,root:j.root});
 let previous=hash(lines[0]);
 for(const [i,line] of lines.slice(1).entries()){
  assert.deepEqual(Object.keys(line).sort(),['sequence','previous','event','digest'].sort());
  assert.equal(line.sequence,i+1);assert.equal(line.previous,previous);
  assert.equal(line.digest,hash({sequence:line.sequence,previous:line.previous,event:line.event}));previous=line.digest;
 }
 return lines;
}
export function appendJournal(j,event){
 const lines=readJournal(j),last=lines.at(-1),body={sequence:lines.length,previous:last.digest??hash(last),event};
 const fd=openSync(j.path,'a');try{writeSync(fd,JSON.stringify({...body,digest:hash(body)})+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 return event;
}
export function writeReceipt(j,receipt){
 readJournal(j);appendJournal(j,{phase:'receipt',status:receipt.status});
 const path=resolve(j.root.path,'receipt.json');durableFile(path,JSON.stringify(receipt)+'\n');syncDirectory(j.root.path);
 return {path,bytes:readFileSync(path).length,sha256:hash(readFileSync(path))};
}
export function writePrivateConfig(j,role,value){
 readJournal(j);const path=resolve(j.root.path,role+'-'+randomUUID()+'.json');
 durableFile(path,JSON.stringify(value)+'\n');syncDirectory(j.root.path);return path;
}
// Used only by the closed negative probe; restoration keeps the original inode.
export function parkJournal(j){const parked=j.path+'.parked-'+randomUUID();readJournal(j);renameSync(j.path,parked);return parked;}
