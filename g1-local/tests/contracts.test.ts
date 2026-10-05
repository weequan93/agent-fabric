import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_POLICY, validateLocalPolicy, parseCreateTaskRequest, parseTaskCommand } from '../src/contracts.js';
import { LocalError } from '../src/errors.js';
const create={spaceId:'private-test',title:'Local task',input:'Synthetic input',commandId:'create-1'};
test('local policy defaults and exact profile permit only synthetic local operation',()=>{
 assert.deepEqual(validateLocalPolicy(),{modelMode:'deterministic-test',effectMode:'synthetic-only',paidCallsAllowed:false,remoteAllowed:false});
 assert.deepEqual(validateLocalPolicy({}),LOCAL_POLICY);assert.deepEqual(validateLocalPolicy({...LOCAL_POLICY}),LOCAL_POLICY);assert.ok(Object.isFrozen(LOCAL_POLICY));
});
test('paid suppliers, remote enrollment and external effects cannot be enabled by configuration',()=>{
 for(const value of [{provider:'supplier'},{apiKey:'fake'},{gateway:'https://supplier.invalid'},{modelMode:'real'},{paidCallsAllowed:true}])assert.throws(()=>validateLocalPolicy(value),{code:'PAID_ROUTE_NOT_AUTHORIZED'});
 for(const value of [{remoteAllowed:true},{ssh:'localhost'},{cloud:'region'},{computer:true},{localWorkerEnrollment:true}])assert.throws(()=>validateLocalPolicy(value),{code:'REMOTE_NOT_AUTHORIZED'});
 assert.throws(()=>validateLocalPolicy({effectMode:'external'}),{code:'LOCAL_POLICY_VIOLATION'});assert.throws(()=>validateLocalPolicy({unknownFlag:true}),{code:'LOCAL_POLICY_VIOLATION'});
 for(const value of [null,[],42,'local'])assert.throws(()=>validateLocalPolicy(value),LocalError);
});
test('create task wire preserves valid intent and explicit group trigger without manufacturing authority',()=>{
 assert.deepEqual(parseCreateTaskRequest(create),create);
 for(const intent of ['ask','plan','act'] as const){const input={...create,intent,sourceIds:['source-1'],explicitTrigger:true};const parsed=parseCreateTaskRequest(input);assert.deepEqual(parsed,input);input.sourceIds.push('source-2');assert.deepEqual(parsed.sourceIds,['source-1']);}
});
test('caller identity, payer, grants and source permission fields are rejected',()=>{
 for(const [field,value] of Object.entries({actorId:'forged',actor:{id:'forged'},payerId:'payer',grants:['approve'],audience:['anyone'],sourcePermissions:['read'],sourceAudience:['anyone'],sources:[{sourceId:'s',readable:true}]}))assert.throws(()=>parseCreateTaskRequest({...create,[field]:value}),{code:'INVALID_SCHEMA'},field);
});
test('create task requires bounded complete input and distinct source identifiers',()=>{
 for(const field of ['spaceId','title','input','commandId'] as const){const incomplete={...create} as Record<string,unknown>;delete incomplete[field];assert.throws(()=>parseCreateTaskRequest(incomplete),{code:'INVALID_SCHEMA'});assert.throws(()=>parseCreateTaskRequest({...create,[field]:'  '}),{code:'INVALID_SCHEMA'});}
 for(const patch of [{intent:'publish'},{explicitTrigger:'true'},{sourceIds:['s','s']},{sourceIds:[null]},{sourceIds:Array.from({length:33},(_,i)=>'s'+i)},{title:'x'.repeat(257)},{input:'x'.repeat(16385)}])assert.throws(()=>parseCreateTaskRequest({...create,...patch}),{code:'INVALID_SCHEMA'});
});
test('five closed command kinds preserve their immutable identifiers',()=>{
 for(const command of [{kind:'reviseTask',commandId:'revise',input:'new input',expectedRevision:1},{kind:'startRun',commandId:'start',planVersion:1},{kind:'approve',commandId:'approve',planVersion:2},{kind:'stop',commandId:'stop',scope:'run',runId:'run-1',expectedRevision:0},{kind:'reconcile',commandId:'reconcile',operationId:'operation-1'}])assert.deepEqual(parseTaskCommand(command),command);
 assert.deepEqual(parseTaskCommand({kind:'stop',commandId:'old-view-stop',scope:'task',expectedRevision:0}),{kind:'stop',commandId:'old-view-stop',scope:'task',expectedRevision:0});
});
test('commands cannot attach caller authorization or silently substitute targets',()=>{
 for(const kind of ['publish','comment','resize','unknown'])assert.throws(()=>parseTaskCommand({kind,commandId:'invalid'}),{code:'INVALID_SCHEMA'});
 for(const command of [{kind:'approve',commandId:'a',planVersion:1,approverActorId:'self'},{kind:'stop',commandId:'s',scope:'run'},{kind:'stop',commandId:'s',scope:'task',runId:'run-1'},{kind:'reconcile',commandId:'r',operationId:'op',outcome:'committed'},{kind:'reviseTask',commandId:'v',input:'new',payerId:'payer'},{kind:'startRun',commandId:'n',planVersion:1,grants:['run']}])assert.throws(()=>parseTaskCommand(command),{code:'INVALID_SCHEMA'});
});
test('partial commands and unsafe revision or plan numbers fail closed',()=>{
 for(const number of [-1,Number.MAX_SAFE_INTEGER+1,Infinity,NaN,1.5])assert.throws(()=>parseTaskCommand({kind:'stop',commandId:'s',scope:'task',expectedRevision:number}),{code:'INVALID_SCHEMA'});
 for(const number of [0,-1,Number.MAX_SAFE_INTEGER+1,Infinity,NaN,1.5])assert.throws(()=>parseTaskCommand({kind:'approve',commandId:'a',planVersion:number}),{code:'INVALID_SCHEMA'});
 for(const command of [{kind:'reviseTask',commandId:'r'},{kind:'startRun',commandId:'s'},{kind:'approve',planVersion:1},{kind:'stop',commandId:'s'},{kind:'reconcile',commandId:'r'}])assert.throws(()=>parseTaskCommand(command),{code:'INVALID_SCHEMA'});
});
