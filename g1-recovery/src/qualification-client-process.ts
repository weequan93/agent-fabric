/** Actual disposable orchestration client: no database or controller credentials. */
import {Client,Connection} from '@temporalio/client';
const raw=process.env.FABRIC_QUALIFICATION_CLIENT;
if(!raw)throw new Error('Owned client configuration required');
const c=JSON.parse(raw) as {owner:string;address:string;workflowId:string;taskQueue:string;ref:unknown};
const connection=await Connection.connect({address:c.address});
try {
 await new Client({connection}).workflow.start('effectRecovery',{workflowId:c.workflowId,taskQueue:c.taskQueue,args:[c.ref]});
 process.stdout.write(JSON.stringify({kind:'client-accepted',owner:c.owner,pid:process.pid,workflowId:c.workflowId,controllerCredentials:false})+'\n');
}finally{
 await connection.close();
 process.stdout.write(JSON.stringify({kind:'client-disconnected',owner:c.owner,pid:process.pid,connectionClosed:true})+'\n');
}
