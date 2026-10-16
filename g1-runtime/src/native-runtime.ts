/** Existing native engine, installed over explicitly bounded service/fixture ports. */
import {SessionLoop,type SessionPorts} from '../../engine/kernel/src/session-loop.js';
import {createRun} from '../../engine/scheduler/src/run-state.js';
import type {DomainEvent} from '../../engine/contracts/src/events.js';
import type {TaskEnvelope} from './owners.js';
export const serviceLaunchDescriptor=Object.freeze({
 schemaVersion:1,execution:'service',assurance:'owned-local-fixture',
 ports:Object.freeze(['eligible-source','bounded-model']),mounts:Object.freeze([]),
 spaceFilesystem:false,unrestrictedShell:false,computer:false,allocator:false
});
export function nativeSession(envelope:TaskEnvelope,runId:string,ports:SessionPorts,events:readonly DomainEvent[]=[]):SessionLoop {
 const run=createRun({scope:envelope.scope,taskId:envelope.taskId,runId,attempt:1,requirementsRevision:envelope.requirementsRevision,versions:envelope.versions});
 const loop=new SessionLoop(run,ports);
 if(events.length)loop.restore(events);
 else {loop.transition('preparing',{});loop.transition('running',{});}
 return loop;
}
