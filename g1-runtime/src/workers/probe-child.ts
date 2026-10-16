/** Owned fixed child independently tries to misuse its parent's narrow credential. */
let bytes='';for await(const chunk of process.stdin){bytes+=String(chunk);if(Buffer.byteLength(bytes)>65_536)throw new Error('bounded');}
try{
 const {request:r,grant}=JSON.parse(bytes),send=async(path:string,body:unknown)=>{const response=await fetch(grant.endpoint+path,{method:'POST',headers:{authorization:grant.credential,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(4500)});await response.arrayBuffer();return response.status;};
 if(await send('/observe',{operationId:r.operationId,path:r.path,pid:process.pid,ppid:process.ppid,cwd:process.cwd(),uid:process.getuid?.()??null,environmentKeys:Object.keys(process.env).sort(),execPath:process.execPath,argv:process.argv.slice(1),role:'child'})!==200)throw new Error('observe');
 for(const path of ['/effect','/external','/control','/secret','/socket','/db'])if(await send(path,{...r,targetId:'00000000-0000-4000-8000-000000000099'})!==403)throw new Error('boundary');
 process.stdout.write(JSON.stringify({pid:process.pid,denials:6}));
}catch{process.exitCode=1;}
