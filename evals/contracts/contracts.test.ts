import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDigest, DomainError, ERROR_CODES, record } from '../../engine/contracts/src/identity.js';
import { parseTaskEnvelope, serializeTaskEnvelope, assertVersionCompatible, parseScope } from '../../engine/contracts/src/task-envelope.js';
import { parseModelCapabilities, assertRequiredCapabilities } from '../../engine/contracts/src/adapters.js';
import type { TaskEnvelope, VersionPins } from '../../engine/contracts/src/task-envelope.js';
import { validateCommand } from '../../engine/contracts/src/commands.js';
import type { CommandEnvelope } from '../../engine/contracts/src/commands.js';
import { validateEvent, replayEvents } from '../../engine/contracts/src/events.js';
import type { DomainEvent } from '../../engine/contracts/src/events.js';
const pins: VersionPins={engine:'engine-1',schema:'schema-1',behavior:'behavior-1',environment:'image-sha256-a'};
function envelope(): TaskEnvelope {return {schemaVersion:1,scope:{tenantId:'tenant-a',spaceId:'space-private'},taskId:'task-1',requirementsRevision:7,intent:'ask',executionClass:'conversation',effectCeiling:['read','model'],sources:[{sourceId:'source-1',scope:{tenantId:'tenant-a',spaceId:'space-private'},audience:['actor-alice'],trust:'trusted',observedAt:1700000000000}],targets:[],payerId:'server-payer',allowanceId:'allowance-1',ceilingUnits:100,continuation:'safe',requiredChecks:['protected-g0'],versions:{...pins},groupTrigger:false};}
function rejectsEnvelope(change:(row:Record<string,unknown>)=>void,code:string='INVALID_SCHEMA'):void {const row=structuredClone(envelope()) as unknown as Record<string,unknown>;change(row);assert.throws(()=>parseTaskEnvelope(row),{code});}
test('G0-O01/allowed',()=>{const input=envelope();assert.deepEqual(parseTaskEnvelope(input),input);assert.deepEqual(parseTaskEnvelope(JSON.parse(serializeTaskEnvelope(input))),input);assert.equal(canonicalDigest(parseTaskEnvelope(input)),canonicalDigest(input));});
test('G0-O01/denied',()=>{
 rejectsEnvelope(row=>{row['securityBypass']=true;});
 rejectsEnvelope(row=>{const sources=row['sources'] as Record<string,unknown>[];delete sources[0]?.['audience'];});
 rejectsEnvelope(row=>{const sources=row['sources'] as Record<string,unknown>[];if(sources[0])sources[0]['audience']=[];});
 rejectsEnvelope(row=>{row['partialToolArguments']={target:'incomplete'};});
 for(const value of [NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1])rejectsEnvelope(row=>{row['ceilingUnits']=value;});
 rejectsEnvelope(row=>{row['effectCeiling']=['write'];},'INTENT_EXCEEDED');rejectsEnvelope(row=>{row['executionClass']='computer';},'INTENT_EXCEEDED');
});
test('G0-O01/recovery',()=>{for(const version of [0,2,'1',null])rejectsEnvelope(row=>{row['schemaVersion']=version;},'UNSUPPORTED_VERSION');const current=envelope();assert.deepEqual(parseTaskEnvelope(current),current);});
test('G0-O02/allowed',()=>{const input=envelope();const before=structuredClone(input);assert.doesNotThrow(()=>assertVersionCompatible(input.versions,{...pins}));assert.deepEqual(input,before);});
test('G0-O02/denied',()=>{const input=envelope();const before=structuredClone(input);for(const field of ['engine','schema','behavior','environment'] as const)assert.throws(()=>assertVersionCompatible(input.versions,{...pins,[field]:pins[field]+'-incompatible'}),{code:'REQUIRED_CAPABILITY_UNSUPPORTED'});assert.deepEqual(input,before);});
test('G0-O02/recovery',()=>{const oldRun=envelope();const before=structuredClone(oldRun);const newPins={engine:'engine-2',schema:'schema-2',behavior:'behavior-2',environment:'image-sha256-b'};assert.throws(()=>assertVersionCompatible(oldRun.versions,newPins),{code:'REQUIRED_CAPABILITY_UNSUPPORTED'});const newRun=parseTaskEnvelope({...envelope(),taskId:'task-2',versions:newPins});assert.doesNotThrow(()=>assertVersionCompatible(newRun.versions,newPins));assert.deepEqual(oldRun,before);assert.notDeepEqual(oldRun.versions,newRun.versions);});
test('canonical digest preserves JSON semantics and rejects unsafe values',()=>{assert.equal(canonicalDigest({a:1,b:[true,'v']}),canonicalDigest({b:[true,'v'],a:1}));assert.notEqual(canonicalDigest(['a','b']),canonicalDigest(['b','a']));const cyclic:Record<string,unknown>={};cyclic['self']=cyclic;for(const value of [undefined,NaN,Infinity,1.1,()=>true,cyclic,[,1],{a:undefined}])assert.throws(()=>canonicalDigest(value),{code:'INVALID_SCHEMA'});});
test('malicious getters rejected with zero invocations while digesting',()=>{let calls=0;const input:Record<string,unknown>={};Object.defineProperty(input,'secret',{enumerable:true,get(){calls++;return 'leak';}});assert.throws(()=>canonicalDigest(input),{code:'INVALID_SCHEMA'});assert.equal(calls,0);assert.throws(()=>record(input,['secret']),{code:'INVALID_SCHEMA'});assert.equal(calls,0);});
test('closed command is detached and refuses unknown fields or versions',()=>{const command:CommandEnvelope={schemaVersion:1,scope:{tenantId:'tenant-a',spaceId:'space-private'},actorId:'actor-alice',taskId:'task-1',runId:'run-1',idempotencyKey:'key-1',kind:'comment',expectedRevision:7,expiresAt:1700000001000,payload:{text:'discussion'}};const copy=validateCommand(command);assert.deepEqual(copy,command);assert.notEqual(copy,command);copy.payload['text']='changed';assert.equal(command.payload['text'],'discussion');assert.throws(()=>validateCommand({...command,role:'owner'} as CommandEnvelope),{code:'INVALID_SCHEMA'});assert.throws(()=>validateCommand({...command,schemaVersion:2} as unknown as CommandEnvelope),{code:'UNSUPPORTED_VERSION'});assert.throws(()=>validateCommand({...command,kind:'stop',payload:{target:'task',extra:true}}),{code:'INVALID_SCHEMA'});});
test('versioned event roundtrip and contiguous scope-safe replay',()=>{const event:DomainEvent={schemaVersion:1,scope:{tenantId:'tenant-a',spaceId:'space-private'},streamId:'run-1',sequence:1,at:1700000000000,kind:'prepared',payload:{revision:7}};assert.deepEqual(validateEvent(JSON.parse(JSON.stringify(event)) as DomainEvent),event);const next:DomainEvent={...event,sequence:2,kind:'running'};assert.equal(replayEvents(0,[event,next],n=>n+1),2);assert.throws(()=>validateEvent({...event,schemaVersion:2} as unknown as DomainEvent),{code:'UNSUPPORTED_VERSION'});assert.throws(()=>validateEvent({...event,partial:true} as DomainEvent),{code:'INVALID_SCHEMA'});assert.throws(()=>replayEvents(0,[next],n=>n+1),{code:'INVALID_SCHEMA'});assert.throws(()=>replayEvents(0,[event,{...next,scope:{tenantId:'tenant-a',spaceId:'space-group'}}],n=>n+1),{code:'SCOPE_MISMATCH'});});
test('public errors fail closed with typed domain codes',()=>{assert.equal(new Set(ERROR_CODES).size,ERROR_CODES.length);const error=new DomainError('UNAUTHORIZED');assert.equal(error.code,'UNAUTHORIZED');assert.equal(error.name,'DomainError');assert.throws(()=>parseTaskEnvelope(null),{code:'INVALID_SCHEMA'});});
test('closed public schemas reject accessors before invoking user code',()=>{
 const command:CommandEnvelope={schemaVersion:1,scope:{tenantId:'tenant-a',spaceId:'space-private'},actorId:'actor-alice',taskId:'task-1',runId:'run-1',idempotencyKey:'key-1',kind:'comment',expectedRevision:7,expiresAt:1700000001000,payload:{text:'discussion'}};
 const event:DomainEvent={schemaVersion:1,scope:{tenantId:'tenant-a',spaceId:'space-private'},streamId:'run-1',sequence:1,at:1700000000000,kind:'prepared',payload:{revision:7}};
 const checks:[object,(input:never)=>unknown][]=[[envelope(),parseTaskEnvelope],[command,validateCommand],[event,validateEvent]];
 for(const [base,validate] of checks){let calls=0;Object.defineProperty(base,'schemaVersion',{enumerable:true,configurable:true,get(){calls++;return 1;}});assert.throws(()=>validate(base as never),{code:'INVALID_SCHEMA'});assert.equal(calls,0);}
 let scopeGetter=0;const scope={spaceId:'space-private',get tenantId(){scopeGetter++;return 'tenant-a';}};
 assert.throws(()=>parseScope(scope),{code:'INVALID_SCHEMA'});assert.equal(scopeGetter,0);
});
test('missing pins, whitespace scope, absent Stop-run identity and empty publish fail closed',()=>{
 assert.throws(()=>assertVersionCompatible({} as VersionPins,{} as VersionPins),{code:'INVALID_SCHEMA'});
 assert.throws(()=>parseScope({tenantId:' ',spaceId:'space-private'}),{code:'INVALID_SCHEMA'});
 const command:CommandEnvelope={schemaVersion:1,scope:{tenantId:'tenant-a',spaceId:'space-private'},actorId:'actor-alice',taskId:'task-1',runId:null,idempotencyKey:'key-1',kind:'stop',expectedRevision:7,expiresAt:1700000001000,payload:{target:'run'}};
 assert.throws(()=>validateCommand(command),{code:'INVALID_SCHEMA'});
 assert.throws(()=>validateCommand({...command,kind:'publish',payload:{}}),{code:'INVALID_SCHEMA'});
});
test('capability manifest roundtrip and mandatory feature refusal',()=>{
 const manifest={provider:'fixture-provider',region:'fixture-region',model:'fixture-model',schema:true,cancellation:true,usage:true,modalities:['text'],manifestDigest:'manifest-digest'};
 assert.deepEqual(parseModelCapabilities(JSON.parse(JSON.stringify(manifest))),manifest);
 assert.throws(()=>parseModelCapabilities({...manifest,grantOwner:true}),{code:'INVALID_SCHEMA'});
 assert.throws(()=>parseModelCapabilities({...manifest,modalities:['unsupported']}),{code:'REQUIRED_CAPABILITY_UNSUPPORTED'});
 assert.doesNotThrow(()=>assertRequiredCapabilities(['schema','cancellation','usage'],['schema','usage']));
 assert.throws(()=>assertRequiredCapabilities(['schema'],['usage']),{code:'REQUIRED_CAPABILITY_UNSUPPORTED'});
});
