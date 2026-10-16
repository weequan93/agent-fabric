import {createScopeVerifier,type VerifiedScope} from '../../src/owners.js';
import {ResourceRepository,ResourceRepositoryError,type ResourceTicket} from '../../src/resource-repository.js';
import {SQLiteResourceStore} from './resource-repository-sqlite.js';
export const fixtureId=(n:number):string=>'30000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
export async function fixtureScope(overrides:Record<string,unknown>={}):Promise<VerifiedScope>{
 const a={tenantId:fixtureId(1),spaceId:fixtureId(2),actorId:fixtureId(3),payerId:fixtureId(4),authorityRevision:1,membershipRevision:1,grants:['task:read','task:write'],actorRevoked:false,payerRevoked:false,membershipRevoked:false,lifecycle:'active' as const,...overrides};
 const verifier=createScopeVerifier(async()=>a);return verifier.verify({tenantId:a.tenantId,spaceId:a.spaceId,sessionCredential:'owned-synthetic-not-a-real-credential'});
}
export type ClientCommand={path:string;op:'admit'|'lookup'|'poll'|'cancel'|'release'|'observe';request?:unknown;key?:string;scope?:Record<string,unknown>;now:number;barrier?:'before'|'after';unknownAck?:boolean;readOnly?:boolean;proof?:boolean};
if(process.argv.includes('--resource-client')){
 process.once('message',async(raw:ClientCommand)=>{
  let store:SQLiteResourceStore|undefined;
  const barrier=async()=>{await new Promise<void>(resolve=>{process.send!({barrier:raw.barrier});process.once('message',()=>resolve());});};
  try{
   const faults={...(raw.readOnly?{readOnly:true}:{}),...(raw.barrier==='before'?{beforeCommit:barrier}:{}),...(raw.barrier==='after'?{afterCommit:barrier}:raw.unknownAck?{afterCommit:async()=>{throw new Error('Injected lost commit ACK');}}:{})};
   store=new SQLiteResourceStore(raw.path,faults);
   if(raw.op==='observe'){process.send!({ok:true,result:store.observe()});}
   else{
    const scope=await fixtureScope(raw.scope);
    const proofs=new WeakSet<object>();const proof=Object.freeze({fixture:'no executor installed'});if(raw.proof)proofs.add(proof);
    const repository=new ResourceRepository(store,{async require(_s:VerifiedScope,_t:ResourceTicket,p:unknown){if(!p||typeof p!=='object'||!proofs.has(p))throw new ResourceRepositoryError('release-proof-required');}},()=>raw.now);
    const result=raw.op==='admit'?await repository.admit(scope,raw.request):raw.op==='lookup'?await repository.lookup(scope,raw.key!):raw.op==='poll'?await repository.poll(scope,raw.key!):raw.op==='cancel'?await repository.cancel(scope,raw.key!):await repository.release(scope,raw.key!,proof);
    process.send!({ok:true,result});
   }
  }catch(e){process.send!({ok:false,code:e instanceof ResourceRepositoryError?e.code:'fixture-error',message:e instanceof Error?e.message:String(e)});}
  finally{store?.close();process.disconnect();}
 });
 process.send!({ready:true});
}
