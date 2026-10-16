/** Independent OS HTTP client used for simultaneous admission probes. */
const [url,token,body]=process.argv.slice(2);
try{
 const response=await fetch(url!,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body!,signal:AbortSignal.timeout(5000)});
 process.send?.({status:response.status,body:await response.json()},()=>process.disconnect());
}catch(e){process.send?.({error:String(e)},()=>process.disconnect());process.exitCode=1;}
export {};
