/** Independent owned target observer. No repository or personal target is mounted. */
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.argv[2]!,secret=process.argv[3]!;
const calls:{operationId:string;digest:string}[]=[];
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.authorization!==secret){res.writeHead(403).end();return;}
  if(req.method==='GET'&&req.url==='/snapshot'){
   res.end(JSON.stringify({target:readFileSync(join(root,'target.txt'),'utf8'),unrelated:readFileSync(join(root,'unrelated.txt'),'utf8'),calls}));return;
  }
  if(req.method==='POST'&&req.url==='/bounded'){
   let bytes='';for await(const c of req){bytes+=String(c);if(bytes.length>8192)throw new Error('bounded');}
   const r=JSON.parse(bytes) as {operationId:string;digest:string;payload:string};
   if(calls.some(c=>c.operationId===r.operationId))throw new Error('duplicate target invocation');
   if(typeof r.payload!=='string'||r.payload.length>2048)throw new Error('bounded');
   writeFileSync(join(root,'target.txt'),r.payload);calls.push({operationId:r.operationId,digest:r.digest});res.end(JSON.stringify({applied:true}));return;
  }
  res.writeHead(404).end();
 }catch{res.writeHead(409).end();}
});
server.listen(0,'127.0.0.1',()=>process.send?.({port:(server.address() as {port:number}).port,pid:process.pid}));
process.on('message',()=>{server.closeAllConnections();server.close(()=>process.disconnect());});
