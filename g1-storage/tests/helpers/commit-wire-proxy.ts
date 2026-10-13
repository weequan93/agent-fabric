import { createServer,connect,type Socket } from 'node:net';
import { demand } from '../../src/errors.js';
/** Test-only loopback PG transport. Drop the genuine backend CommandComplete
 * for COMMIT and its following ReadyForQuery, rather than a service/HTTP ACK.
 * Other protocol bytes pass unchanged; credentials remain fixture-held. */
export async function startCommitWireProxy(dsn:string,mode:'commit'|'rollback'='commit'){
 const target=new URL(dsn);demand(target.hostname==='127.0.0.1','UNAUTHORIZED');
 const sockets=new Set<Socket>();let armed=true,commitAcknowledgementsDropped=0,commitRequestsDropped=0;
 const server=createServer(client=>{
  const upstream=connect({host:'127.0.0.1',port:Number(target.port)});sockets.add(client);sockets.add(upstream);
  client.on('error',()=>{});upstream.on('error',()=>client.destroy());
  client.once('close',()=>{sockets.delete(client);upstream.destroy();});upstream.once('close',()=>{sockets.delete(upstream);client.destroy();});
  if(mode==='commit')client.pipe(upstream);
  else {
   let incoming=Buffer.alloc(0),startup=true;
   client.on('data',(data:Buffer)=>{
    incoming=Buffer.concat([incoming,data]);
    while(incoming.length>=(startup?4:5)){
     const length=startup?incoming.readUInt32BE(0):incoming.readUInt32BE(1)+1;
     demand(length>=(startup?4:5)&&length<=1048576,'INTEGRITY_FAILED');if(incoming.length<length)return;
     const frame=incoming.subarray(0,length);incoming=incoming.subarray(length);
     if(!startup&&frame[0]===81&&frame.subarray(5).toString('utf8')==='COMMIT\0'){
      commitRequestsDropped++;client.destroy();upstream.destroy();return;
     }startup=false;upstream.write(frame);
    }
   });
  }
  let pending=Buffer.alloc(0);
  upstream.on('data',(data:Buffer)=>{
   pending=Buffer.concat([pending,data]);
   while(pending.length>=5){
    const length=pending.readUInt32BE(1)+1;demand(length>=5&&length<=1048576,'INTEGRITY_FAILED');
    if(pending.length<length)return;
    const frame=pending.subarray(0,length);pending=pending.subarray(length);
    if(mode==='commit'&&armed&&frame[0]===67&&frame.subarray(5).toString('utf8')==='COMMIT\0'){
     armed=false;commitAcknowledgementsDropped++;client.destroy();upstream.destroy();return;
    }
    client.write(frame);
   }
  });
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();demand(address&&typeof address==='object','AUTHORITY_UNAVAILABLE');
 const proxy=new URL(dsn);proxy.port=String(address.port);
 return {dsn:proxy.href,dropped:()=>commitAcknowledgementsDropped,requestsDropped:()=>commitRequestsDropped,async close(){for(const socket of sockets)socket.destroy();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));demand(sockets.size===0,'CLEANUP_UNPROVEN');}};
}
