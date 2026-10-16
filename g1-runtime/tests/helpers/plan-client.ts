import {SQLitePlanFixture,planScope,type PlanFixtureHooks} from './plan-fixture.js';
export interface PlanClientCommand {root:string;op:'save'|'lookup'|'reopen'|'record';request?:unknown;key?:string;sessionId?:string;documentId?:string;version?:number;hooks?:Omit<PlanFixtureHooks,'pause'>}
if(process.argv.includes('--plan-client')){
 process.once('message',async(command:PlanClientCommand)=>{
  let fixture:SQLitePlanFixture|undefined;
  try{
   let paused=false;
   fixture=new SQLitePlanFixture(command.root,{...command.hooks,pause:async phase=>{
    if(paused)return;paused=true;await new Promise<void>(resolve=>{process.send!({paused:phase});process.once('message',()=>resolve());});
   }});
   const scope=await planScope(command.root),repo=fixture.repository;
   const result=command.op==='save'?await repo.save(scope,command.request):command.op==='lookup'?await repo.lookup(scope,command.key!):command.op==='record'?await repo.record(scope,command.request):await repo.reopen(scope,command.sessionId!,command.documentId!,command.version);
   process.send!({ok:true,result});
  }catch(e){process.send!({ok:false,code:e instanceof Error&&'code' in e?e.code:'fixture-error',message:e instanceof Error?e.message:String(e)});}
  finally{fixture?.close();process.disconnect();}
 });process.send!({ready:true});
}
