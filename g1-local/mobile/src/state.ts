import type { TaskView, TaskSync, ClientDelivery } from './api';
export function mergeTaskView(current:TaskView|null,incoming:TaskView):TaskView{
 if(incoming.schemaVersion!==1||incoming.modelMode!=='deterministic-test'||incoming.effectMode!=='synthetic-only'||incoming.paidCallsAllowed!==false||incoming.remoteAllowed!==false)throw Error('Unsupported local response');
 if(!current)return incoming;
 if(current.task.taskId!==incoming.task.taskId||current.task.scope.tenantId!==incoming.task.scope.tenantId||current.task.scope.spaceId!==incoming.task.scope.spaceId||current.cursor.streamId!==incoming.cursor.streamId)throw Error('Immutable Task/Space mismatch');
 if(incoming.authorityRevision<current.authorityRevision||incoming.task.revision<current.task.revision||incoming.task.generation<current.task.generation||incoming.cursor.generation<current.cursor.generation||(incoming.cursor.generation===current.cursor.generation&&incoming.cursor.sequence<current.cursor.sequence))return current;
 return incoming;
}
export function applyTaskSync(current:TaskView,sync:TaskSync):TaskView{
 if(sync.kind==='snapshot')return mergeTaskView(current,sync.snapshot);
 if(sync.scope.spaceId!==current.task.scope.spaceId||sync.scope.tenantId!==current.task.scope.tenantId||sync.cursor.streamId!==current.cursor.streamId)throw Error('Wrong event scope');
 if(sync.authorityRevision<current.authorityRevision)return current;
 if(sync.cursor.generation!==current.cursor.generation)throw Error('Snapshot required for new generation');
 let next=current,sequence=current.cursor.sequence;
 for(const event of sync.events){if(event.taskId!==current.task.taskId||event.scope.spaceId!==current.task.scope.spaceId||event.scope.tenantId!==current.task.scope.tenantId||event.generation!==current.cursor.generation)throw Error('Wrong event binding');if(event.sequence<=sequence)continue;if(event.sequence!==sequence+1||event.task.cursor.sequence!==event.sequence)throw Error('Event gap: refresh authorized snapshot');next=mergeTaskView(next,event.task);sequence=event.sequence;}
 if(sequence!==sync.cursor.sequence)throw Error('Incomplete event cursor');return next;
}
export function deliveryMessage(delivery:ClientDelivery|null):string{return !delivery?'No command submitted.':delivery.status==='not-delivered'?'Not delivered. Reconnect, then decide explicitly whether to send.':delivery.status==='unknown'?'Delivery unknown. Query the original command; do not resend.':'Request acknowledged. Check the authoritative outcome below.';}
