const [url,credential,body]=process.argv.slice(2);
try{const response=await fetch(url!,{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json'},body:body!,signal:AbortSignal.timeout(15_000)});process.send?.({status:response.status,body:await response.json(),pid:process.pid});}catch{process.send?.({status:599,body:{code:'CLIENT_FAILED'},pid:process.pid});}
process.disconnect();
