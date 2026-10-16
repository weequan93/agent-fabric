const [url,credential,body]=process.argv.slice(2);
const response=await fetch(url!,{method:'POST',headers:{authorization:credential!,'content-type':'application/json'},body:body!,signal:AbortSignal.timeout(3000)});
process.send!({status:response.status,body:await response.json(),pid:process.pid});process.disconnect();
