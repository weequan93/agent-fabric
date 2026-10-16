/** A retained independent local capability client, not an OS sandbox escape. */
const [url,credential,body]=process.argv.slice(2);const original=JSON.parse(body!);
process.on('message',async(raw:any)=>{
 if(raw?.kind==='close'){process.disconnect();return;}if(raw?.kind!=='attempt')throw new Error('Invalid fixture IPC');
 const response=await fetch(url!,{method:'POST',headers:{authorization:credential!,'content-type':'application/json'},body:JSON.stringify({...original,...raw.delta}),signal:AbortSignal.timeout(3000)});
 process.send!({status:response.status,body:await response.json(),pid:process.pid});
});
process.send!({ready:true,pid:process.pid});
