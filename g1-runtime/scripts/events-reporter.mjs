// Node's runner event stream, separate from untrusted test stdout/TAP labels.
export default async function* events(source){
 for await(const event of source)yield JSON.stringify(event,(key,value)=>value instanceof Error?{name:value.name,message:value.message,code:value.code}:value)+'\n';
}
