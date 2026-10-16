/** Trusted fixed worker. Arguments are data; arbitrary code/module loading is absent. */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ToolRequestSchema,type ToolRequest} from '../tool-registry.js';
export async function perform(input:unknown,channel:string):Promise<string>{
 if(!input||typeof input!=='object')throw new Error('INVALID_SCHEMA');
 const {request:raw,grant}=input as {request:unknown;grant:{endpoint:string;credential:string}},r=ToolRequestSchema.parse(raw);
 if(channel!==r.path)throw new Error('INVALID_SCHEMA');
 const send=async(path:string,body:unknown,credential=grant.credential)=>{
  const result=await fetch(grant.endpoint+path,{method:'POST',headers:{authorization:credential,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(4500)});
  return {status:result.status,body:await result.json()};
 };
 const observed=await send('/observe',{operationId:r.operationId,path:channel,pid:process.pid,ppid:process.ppid,cwd:process.cwd(),uid:process.getuid?.()??null,environmentKeys:Object.keys(process.env).sort(),execPath:process.execPath,argv:process.argv.slice(1)});
 if(observed.status!==200)throw new Error('AUTHORITY_UNAVAILABLE');
 if(r.args.probe!=='none'){
  // The fixed adversarial probe knows only its original operation-scoped credential.
  const bad={...r,targetId:'00000000-0000-4000-8000-000000000099',effect:'target-write',probe:r.args.probe};
  const denied=await send('/'+r.args.probe,bad);
  if(denied.status!==403)throw new Error('BOUNDARY_FAILED');
  const result=await send('/probe-result',{operationId:r.operationId,probe:r.args.probe,status:denied.status});
  if(result.status!==200)throw new Error('AUTHORITY_UNAVAILABLE');
 }
 if(r.args.probe==='child'){
  const child=spawn(process.execPath,[fileURLToPath(new URL('./probe-child.js',import.meta.url))],{cwd:process.cwd(),env:process.env,stdio:['pipe','pipe','inherit']});let result='';child.stdout.on('data',b=>{result+=String(b);});child.stdin.end(JSON.stringify({request:r,grant}));
  const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});if(exit!==0||JSON.parse(result).denials!==6)throw new Error('BOUNDARY_FAILED');
 }
 if(r.args.durationMs)await new Promise(resolve=>setTimeout(resolve,r.args.durationMs));
 const result=await send('/effect',r);
 if(result.status!==200)throw new Error('TARGET_REFUSED');
 return 'x'.repeat(r.args.outputBytes);
}
if(!process.argv[1]?.endsWith('stdio-mcp.js')){
 process.stderr.write('AF_READY\n');let bytes='';for await(const c of process.stdin){bytes+=String(c);if(Buffer.byteLength(bytes)>65_536)throw new Error('INVALID_SCHEMA');}
 try{const output=await perform(JSON.parse(bytes),process.argv[2]!);process.stdout.write(output);}catch{process.exitCode=1;}
}
