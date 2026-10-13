import { demand } from './errors.js';
import type { SqlTransaction,VerifiedScope } from './owners.js';
/** The optional forward migration leaves the accepted v28 owner usable. Once
 * installed, an immutable cancellation fences every later serving attempt. */
export async function assertRestoreNotRolledBack(tx:SqlTransaction,s:VerifiedScope,id:string){
 if((await tx.query("SELECT to_regclass('fabric.storage_restore_rollbacks') AS r")).rows[0]?.['r'])
  demand(!(await tx.query('SELECT 1 FROM fabric.storage_restore_rollbacks WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[s.tenantId,s.spaceId,id])).rowCount,'RESTORE_BLOCKED');
}
