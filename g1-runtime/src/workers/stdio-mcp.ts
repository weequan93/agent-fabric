/** Actual bounded newline-delimited MCP stdio lifecycle; one installed tool only. */
import {createInterface} from 'node:readline';
import {perform} from './owned-worker.js';
process.stderr.write('AF_READY\n');let initialized=false,announced=false,called=false;
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{
  if(Buffer.byteLength(line)>65_536)throw new Error('INVALID_SCHEMA');const m=JSON.parse(line);
  if(m.jsonrpc!=='2.0')throw new Error('INVALID_SCHEMA');let result:unknown;
  if(m.method==='initialize'&&!initialized&&m.params?.protocolVersion==='2024-11-05'){initialized=true;result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixed-owned-mcp',version:'1.0.0'}};}
  else if(m.method==='notifications/initialized'&&initialized&&!announced){announced=true;continue;}
  else if(m.method==='tools/list'&&announced&&!called)result={tools:[{name:'owned-target',description:'One operation-scoped owned target',inputSchema:{type:'object',additionalProperties:false,required:['request','grant'],properties:{request:{type:'object'},grant:{type:'object'}}}}]};
  else if(m.method==='tools/call'&&announced&&!called&&m.params?.name==='owned-target'){called=true;result={content:[{type:'text',text:await perform(m.params.arguments,'mcp')}],isError:false};}
  else throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n');
 }catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32602,message:'Request refused'}})+'\n');process.exitCode=1;break;}
}
