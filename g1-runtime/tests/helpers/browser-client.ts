/** Independent request process. Sensitive specimens travel over IPC, never argv. */
process.once('message',async(raw:{url:string;token:string;body:string;method?:string})=>{
 try{
  const response=await fetch(raw.url,{method:raw.method??'POST',headers:{authorization:'Bearer '+raw.token,'content-type':'application/json'},...(raw.method==='GET'?{}:{body:raw.body}),signal:AbortSignal.timeout(5000)});
  process.send?.({status:response.status,bytes:await response.text(),cache:response.headers.get('cache-control'),pid:process.pid},()=>process.disconnect());
 }catch{process.send?.({error:'REQUEST_FAILED'},()=>process.disconnect());process.exitCode=1;}
});
process.send?.({ready:true,pid:process.pid});
export {};
