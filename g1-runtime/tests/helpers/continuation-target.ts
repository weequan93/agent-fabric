import {createServer} from 'node:http';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const [root,secret]=process.argv.slice(2);if(!root||!secret)throw new Error('Owned target required');
const path=join(root,'actual-target.json');writeFileSync(path,JSON.stringify({events:[],protected:'unchanged',publication:null}),{flag:'wx'});
const server=createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');if(req.headers.authorization!==secret){res.statusCode=403;res.end('{}');return;}
 if(req.method==='GET'&&req.url==='/snapshot'){res.end(readFileSync(path));return;}
 if(req.method!=='POST'||req.url!=='/effect'){res.statusCode=403;res.end('{}');return;}
 let text='';for await(const b of req){text+=String(b);if(text.length>8192)throw new Error('Invalid target request');}
 const event=JSON.parse(text),snapshot=JSON.parse(readFileSync(path,'utf8'));snapshot.events.push({...event,observedAt:Date.now(),sequence:snapshot.events.length+1});if(event.action==='fixture-publication')snapshot.publication={operationId:event.operationId,generation:event.generation};writeFileSync(path,JSON.stringify(snapshot));res.end('{}');
});
server.listen(0,'127.0.0.1',()=>process.send!({port:(server.address() as {port:number}).port,pid:process.pid}));
process.on('message',()=>{server.closeAllConnections();server.close(()=>process.disconnect());});
