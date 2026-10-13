import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {verifyAtomicPhaseRecords,type AtomicPhaseRecord} from './atomic-disconnect-records.js';

if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const input=JSON.parse(readFileSync(0,'utf8')) as {records:AtomicPhaseRecord[];ids:string[]};
  verifyAtomicPhaseRecords(input.records,input.ids);
  process.stdout.write('ATOMIC_DISCONNECT_ACCEPT\n');
 }catch(error){
  const message=error instanceof Error?error.message:'';
  if(!message.startsWith('ATOMIC_DISCONNECT_REJECT:'))throw error;
  process.stderr.write(message+'\n');process.exitCode=1;
 }
}
