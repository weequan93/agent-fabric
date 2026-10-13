import { randomUUID } from 'node:crypto';
// Closed inert local process. Its nonce is in argv and the ready handshake.
if(process.argv.length!==3||!/^([a-f0-9-]{36})$/.test(process.argv[2]))throw new Error('Closed probe nonce required');
console.log(JSON.stringify({marker:process.argv[2],pid:process.pid,probe:randomUUID()}));
setInterval(()=>{},1000);
process.on('SIGTERM',()=>process.exit(0));
