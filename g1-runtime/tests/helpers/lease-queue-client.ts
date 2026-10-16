import {queueClientCommand,type QueueClientCommand} from './lease-queue-fixture.js';
if(process.argv.includes('--lease-queue-client')){
 let continueBarrier:(()=>void)|undefined;
 process.on('message',async(raw:QueueClientCommand|{op:'continue'})=>{
  if(raw.op==='continue'){if(!continueBarrier)throw new Error('No owned barrier');const done=continueBarrier;continueBarrier=undefined;done();return;}
  if(raw.op==='close'){process.send!({ok:true},()=>process.disconnect());return;}
  try{const result=await queueClientCommand(raw,kind=>new Promise<void>(resolve=>{continueBarrier=resolve;process.send!({barrier:kind});}));process.send!({ok:true,result});}
  catch(e){process.send!({ok:false,code:e&&typeof e==='object'&&'code' in e?e.code:'fixture-error',message:e instanceof Error?e.message:String(e)});}
 });
 process.send!({ready:true});
}
