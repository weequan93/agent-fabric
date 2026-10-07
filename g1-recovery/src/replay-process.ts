import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import proto from '@temporalio/proto';
const {temporal}=proto;
import {ioMeasurements} from './native-activities.js';
Runtime.install({logger:new DefaultLogger('ERROR')});
const file=process.argv[2],mode=process.argv[3];if(!file || !['compatible','incompatible','effects'].includes(mode??''))throw new Error('History path and replay mode required');
// A replay worker has no activity registrations or live service/DB connection.
// The same measured model/checkpoint implementation is loaded but never invoked.
const history=temporal.api.history.v1.History.fromObject(JSON.parse(readFileSync(file,'utf8')));
try {
 await Worker.runReplayHistory({workflowsPath:fileURLToPath(new URL(mode==='effects'?'./effect-workflow.js':mode==='compatible'?'./native-workflow.js':'./incompatible-workflow.js',import.meta.url))},history);
 console.log(JSON.stringify({kind:'replay',mode,success:true,...ioMeasurements}));
} catch(e) {
 console.log(JSON.stringify({kind:'replay',mode,success:false,errorName:(e as Error).name,error:(e as Error).message,...ioMeasurements}));process.exitCode=1;
}
