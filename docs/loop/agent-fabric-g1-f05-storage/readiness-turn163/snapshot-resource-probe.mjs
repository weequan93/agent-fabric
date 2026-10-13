// Native data/identity API availability only. This is not a capture observer,
// admission, deadline control, or product publication.
import assert from 'node:assert/strict';
const owner={},command={key:'synthetic-key',sessionId:'synthetic-session',materialId:'synthetic-material',expected:null,expiresAt:'synthetic-preparation'};
const prepared={owner,command},owners=new WeakMap([[owner,prepared]]);
const historical=Object.freeze(structuredClone(command));
command.expiresAt='synthetic-invocation';
const invocation=Object.freeze(structuredClone(command));
assert.equal(owners.get(owner),prepared);
assert.equal(prepared.command,command);
assert.equal(historical.expiresAt,'synthetic-preparation');
assert.equal(invocation.expiresAt,'synthetic-invocation');
assert.equal(historical.expected,null);
assert.deepEqual(Object.keys(command).filter(k=>historical[k]!==invocation[k]),['expiresAt']);
const optional=structuredClone({presentUndefined:undefined,presentNull:null});
assert(Object.hasOwn(optional,'presentUndefined'));
assert(!Object.hasOwn(optional,'missing'));
assert.equal(optional.presentUndefined,undefined);
assert.equal(optional.presentNull,null);
console.log(JSON.stringify({detachedSnapshotApiAvailable:true,sameMutableObjectIdentityAvailable:true,weakOwnerIdentityAvailable:true,missingNullUndefinedDistinctionAvailable:true,originalFixtureInvoked:false,originalMethodsInvoked:false,observerImplemented:false,captureAdmissionImplemented:false,sameShared33SlotControlsPassed:false,prelaunchGateImplemented:false,originalLifecycleDispatches:0,productQualification:false}));
