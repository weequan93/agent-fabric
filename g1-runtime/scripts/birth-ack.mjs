import {writeFileSync,linkSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
/** Publish complete bytes atomically and without overwriting a prior ACK. A child
 * observing the final name must never see a created-but-empty file. */
export function publishBirthAck(path,record){
 const temporary=path+'.publishing-'+randomUUID();
 writeFileSync(temporary,JSON.stringify(record),{flag:'wx'});
 try{linkSync(temporary,path);}finally{unlinkSync(temporary);}
}
