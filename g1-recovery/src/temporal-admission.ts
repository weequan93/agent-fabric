import {Client,WorkflowExecutionAlreadyStartedError,WorkflowIdReusePolicy} from '@temporalio/client';
import type {VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {FoundationError} from '../../g1-foundations/src/contracts.js';
import {RecoveryRepository,receiptSchema} from './repository.js';
import {bindingDigest} from './contracts.js';
import type {NativeRef} from './temporal-contracts.js';
/** Durable outbox -> stable workflow ID. A lost start ACK is retried as admission,
 * never as a session/effect dispatch. Temporal cannot grant current authority. */
export async function admitNative(config:{repo:RecoveryRepository;scope:VerifiedScope;client:Client;ref:NativeRef;taskQueue:string;afterStart?:()=>Promise<void>}):Promise<string> {
 const {repo,scope,client,ref,taskQueue}=config;
 const snapshot=await repo.get(scope,ref.runId);
 if(!snapshot || scope.tenantId!==ref.tenantId || scope.spaceId!==ref.spaceId || snapshot.run.binding.task.taskId!==ref.taskId || bindingDigest(snapshot.run.binding)!==ref.bindingDigest || !snapshot.sessions.some(s=>s.sessionId===ref.sessionId))throw new FoundationError('STALE_AUTHORITY');
 const event=(await repo.outbox(scope)).find(e=>e.run_id===ref.runId && receiptSchema.parse(e.payload).revision===1);
 if(!event || Number(event.authority_revision)!==scope.authorityRevision)throw new FoundationError('STALE_AUTHORITY');
 const workflowId='fabric/native/'+ref.tenantId+'/'+ref.spaceId+'/'+ref.runId;
 try {await client.workflow.start('nativeConversation',{workflowId,taskQueue,args:[ref],memo:{admissionDigest:bindingDigest(ref)},workflowIdReusePolicy:WorkflowIdReusePolicy.REJECT_DUPLICATE});}
 catch(e) {
  if(!(e instanceof WorkflowExecutionAlreadyStartedError))throw e;
  const current=await client.workflow.getHandle(workflowId).describe();
  if(current.type!=='nativeConversation' || current.taskQueue!==taskQueue || current.memo?.admissionDigest!==bindingDigest(ref))throw new FoundationError('IDEMPOTENCY_CONFLICT');
 }
 await config.afterStart?.();
 await repo.completeOutbox(scope,String(event.outbox_id));return workflowId;
}
