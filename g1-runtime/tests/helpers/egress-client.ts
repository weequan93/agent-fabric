/** Fixed HTTP fixture client and actual stdio MCP server. No arbitrary code port. */
import {createInterface} from 'node:readline';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const [mode,url,credential,body,probe]=process.argv.slice(2);
async function probeChild(){
 if(!probe)return null;
 const child=spawn(process.execPath,[process.argv[1]!,'probe',url!,credential!,probe],{env:{...process.env},stdio:['ignore','pipe','pipe']});
 const chunks:Buffer[]=[];child.stdout.on('data',(b:Buffer)=>chunks.push(b));const exit=once(child,'close'),[code,signal]=await exit;
 if(code!==0||signal!==null)throw new Error('Owned probe child failed');return JSON.parse(Buffer.concat(chunks).toString());
}
async function call(target:string,token:string,payload:string){
 const response=await fetch(target,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:payload,signal:AbortSignal.timeout(12_000)});
 return {pid:process.pid,ppid:process.ppid,uid:process.getuid?.()??null,status:response.status,body:await response.json(),environmentKeys:Object.keys(process.env).sort(),probe:await probeChild()};
}
if(mode==='probe'){
 const {request:r,endpoint,credential:scoped}=JSON.parse(body!),statuses:number[]=[];
 for(const path of ['/protected','/control','/secret','/socket','/db','/metadata','/owned/write']){
  const response=await fetch(endpoint+path,{method:'POST',headers:{authorization:'Bearer '+scoped,'x-operation-id':r.operationId,'x-target-id':'00000000-0000-4000-8000-000000000099','x-request-digest':'altered'},body:r.body??'unapproved',signal:AbortSignal.timeout(5000)});statuses.push(response.status);await response.arrayBuffer();
 }
 process.stdout.write(JSON.stringify({pid:process.pid,ppid:process.ppid,statuses,environmentKeys:Object.keys(process.env).sort()}));
}else if(mode==='mcp'){
 const lines=createInterface({input:process.stdin,crlfDelay:Infinity});let initialized=false;
 for await(const line of lines){const m=JSON.parse(line);if(m.method==='notifications/initialized'){initialized=true;continue;}
  let result:unknown;
  if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'owned-egress-fixture',version:'1.0.0'}};
  else if(m.method==='tools/list'&&initialized)result={tools:[{name:'owned-http',inputSchema:{type:'object',additionalProperties:false,properties:{},required:[]}}]};
  else if(m.method==='tools/call'&&initialized&&m.params.name==='owned-http')result={content:[{type:'text',text:JSON.stringify(await call(url!,credential!,body!))}]};
  else throw new Error('Unsupported finite MCP method');
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n');
 }
}else{
 try{const result=await call(url!,credential!,body!);if(process.send){process.send(result);process.disconnect?.();}else process.stdout.write(JSON.stringify(result));}
 catch{const result={pid:process.pid,error:'REQUEST_FAILED'};if(process.send){process.send(result);process.disconnect?.();}else process.stdout.write(JSON.stringify(result));process.exitCode=1;}
}
