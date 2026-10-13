import test from 'node:test';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const bytes=readFileSync("/Users/super/Documents/ai/agent-fabric/docs/loop/agent-fabric-g1-f05-storage/readiness-turn112/native-payload.json"),data=bytes.toString('base64'),hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
console.log(JSON.stringify({measurement:'resource-legacy-native',raw:bytes.toString()}));
console.log(JSON.stringify({measurement:'resource-native-large',resourceOnly:true,bytes:bytes.length,digest:hash(bytes),data}));
for(const [i,p] of data.match(/.{1,4096}/g).entries())console.log(JSON.stringify({measurement:'resource-native-chunk',i,data:p}));
await new Promise((res,rej)=>process.stderr.write('resource-stderr-start\n'+'e'.repeat(262144)+'\nresource-stderr-end\n',e=>e?rej(e):res()));
await test('resource-only actual native serializer',()=>{});