import { CryptoStore } from '../../src/crypto-store.js';
import { OwnedCipherFiles,type StagingControl,type LockedStagingLease,type StagingLease } from '../../src/owned-cipher-files.js';
import type { CipherProcessInput,CipherProcessMessage } from './cipher-process-protocol.js';

// Dedicated emitted worker; no database credentials, stdout, archive or key file.
// Installed parent controls keep the exact authenticated transaction/lock alive
// while this process performs filesystem syscalls. Exit aborts that transaction.
let next=0;
const replies=new Map<number,{resolve(v:unknown):void;reject(e:Error):void}>();
function send(m:CipherProcessMessage){if(!process.send)throw new Error('IPC required');process.send(m);}
function call(operation:string,...args:unknown[]):Promise<unknown>{
 const request=++next;
 return new Promise((resolve,reject)=>{replies.set(request,{resolve,reject});send({kind:'request',request,operation,args});});
}
process.on('message',(raw:unknown)=>{
 const m=raw as CipherProcessMessage;
 if(m.kind==='reply'){
  const r=replies.get(m.request!);if(!r)throw new Error('Unknown IPC reply');replies.delete(m.request!);r.resolve(m.value);
 }
 if(m.kind==='refusal'){
  const r=replies.get(m.request!);if(!r)throw new Error('Unknown IPC refusal');replies.delete(m.request!);r.reject(new Error('Installed owner refused'));
 }
});
process.once('message',async(raw:unknown)=>{
 const init=raw as {kind:string;value:CipherProcessInput};
 if(init.kind!=='install')throw new Error('Installed capabilities required');
 const c=init.value;
 const control:StagingControl={
  async reserve(id,root,b){await call('reserve',id,root,b);},
  async lock<T>(id:string,work:(lease:LockedStagingLease)=>Promise<T>):Promise<T>{
   await call('lock',id);
   const value=await work({current:async()=>await call('current') as StagingLease,
    confirm:async v=>{await call('confirm',v);},publish:async v=>{await call('publish',v);}});
   await call('unlock');return value;
  }
 };
 const crypto=new CryptoStore({async resolve(){return {dataKey:c.dataKey,digestKey:c.digestKey};}});
 const files=new OwnedCipherFiles(c.root,crypto,control,{async phase(phase,uploadId){
  if(phase===c.stopAt){send({kind:'phase',phase,uploadId});await new Promise<void>(()=>{});}
 }});
 try{
  if(c.operation==='stage')await files.stage(c.binding,c.value,c.description);else await files.collect();
  send({kind:'unexpected-completion'});
 }catch{send({kind:'unexpected-refusal'});}
 finally{c.dataKey.fill(0);c.digestKey.fill(0);c.value.fill(0);}
});
