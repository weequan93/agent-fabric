/** Independently owned would-be browser resource. Only synthetic files exist here.
 * A channel invocation changes durable counters and target bytes. API under test
 * has no handle to this resource except hostile caller-supplied URL/path fields. */
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {browserChannels} from '../../src/browser.js';
const root=process.argv[2]!,key=process.argv[3]!;
const ledger=join(root,'sink-events.jsonl'),target=join(root,'sink-target.txt'),telemetry=join(root,'sink-telemetry.log');
let events:Record<string,number>=Object.fromEntries(browserChannels.map(c=>[c,0]));
const server=createServer(async(req,res)=>{
 if(req.headers.authorization!==key){appendFileSync(ledger,JSON.stringify({unauthorizedResourceAttempt:true})+'\n');res.writeHead(403).end();return;}
 if(req.url==='/snapshot'){res.end(JSON.stringify({events,ledger:readFileSync(ledger,'utf8'),target:readFileSync(target,'utf8'),telemetry:readFileSync(telemetry,'utf8')}));return;}
 if(req.url==='/reset'){events=Object.fromEntries(browserChannels.map(c=>[c,0]));writeFileSync(ledger,'');writeFileSync(target,'unchanged');writeFileSync(telemetry,'');res.end('reset');return;}
 const channel=req.url?.slice(1);
 if(!browserChannels.includes(channel as typeof browserChannels[number])){res.writeHead(404).end();return;}
 let body='';for await(const chunk of req){body+=String(chunk);if(body.length>65536){res.writeHead(413).end();return;}}
 events[channel!]!++;
 if(channel==='profile'||channel==='cookies'||channel==='import')readFileSync(join(root,'synthetic-personal','cookies.json'));
 appendFileSync(ledger,JSON.stringify({channel,body})+'\n');appendFileSync(telemetry,body);writeFileSync(target,channel!);res.end('effect');
});
server.listen(0,'127.0.0.1',()=>process.send?.({pid:process.pid,port:(server.address() as {port:number}).port}));
process.on('message',()=>{server.closeAllConnections();server.close(()=>process.disconnect());});
