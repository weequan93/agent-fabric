import { assertRunUnfenced } from './native-imports.js';
import { TaskCallBindingSchema } from './schema.js';
import { MAX_ANCESTRY } from './arithmetic.js';
import { demand } from './errors.js';
import type { SqlTransaction,VerifiedScope,TaskCallBinding } from './contracts.js';
/** Caller holds the Space barrier. A replacement Run cannot escape another
 * Run's unresolved model obligation for this Task. The originating Run keeps
 * its existing claim/retry rules; original-owner reconciliation is separate. */
export async function assertOtherRunsResolved(tx:SqlTransaction,scope:VerifiedScope,b:TaskCallBinding):Promise<void>{
 demand(!(await tx.query("SELECT 1 FROM fabric.model_operations WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 AND run_id<>$4 AND record->>'status' IN('prepared','pending','unknown') LIMIT 1",[scope.tenantId,scope.spaceId,b.taskId,b.runId])).rowCount,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
}
/** Pure relationship checks shared by the locked native ancestry walk. */
export function assertBillingAncestor(root:TaskCallBinding,raw:unknown,expectedTaskId:string,visited:ReadonlySet<string>):TaskCallBinding{
 const b=TaskCallBindingSchema.parse(root),parent=TaskCallBindingSchema.parse(raw);
 demand(!visited.has(expectedTaskId)&&visited.size<MAX_ANCESTRY,'CHECK_BINDING_MISMATCH');
 demand(parent.taskId===expectedTaskId&&parent.tenantId===b.tenantId&&parent.spaceId===b.spaceId&&parent.payerId===b.payerId,'CHECK_BINDING_MISMATCH');
 return parent;
}
/** Child billing lineage never expands the parent's continuation authority. */
export async function assertParentUnfenced(tx:SqlTransaction,scope:VerifiedScope,b:TaskCallBinding):Promise<void>{
 const seen=new Set<string>([b.taskId]);let parent=b.parentTaskId;
 while(parent!==null){
  demand(!seen.has(parent)&&seen.size<MAX_ANCESTRY,'CHECK_BINDING_MISMATCH');
  const rows=(await tx.query('SELECT b.run_id,b.record FROM fabric.model_billing_bindings b WHERE b.tenant_id=$1 AND b.space_id=$2 AND b.task_id=$3',[scope.tenantId,scope.spaceId,parent])).rows;
  demand(rows.length>0,'CHECK_BINDING_MISMATCH');let next:string|null|undefined;
  for(const row of rows){
   await assertRunUnfenced(tx,scope,String(row['run_id']));
   const record=assertBillingAncestor(b,row['record'],parent,seen);
   if(next!==undefined)demand(next===record.parentTaskId,'CHECK_BINDING_MISMATCH');next=record.parentTaskId;
  }
  seen.add(parent);parent=next??null;
 }
}
