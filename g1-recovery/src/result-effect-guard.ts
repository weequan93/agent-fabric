import {FoundationError,type SqlTransaction,type VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {artifactSchema,checkSchema,bindingDigest,type Effect} from './contracts.js';
/** Additive installed-profile gate at the original executor's locked I/O boundary.
 * Older qualification profiles have no result store. Once installed, a configured
 * Task's artifact-bound effects cannot bypass current artifact/check preconditions. */
export async function assertResultEffectCurrent(tx:SqlTransaction,s:VerifiedScope,e:Effect):Promise<void>{
 if((await tx.query("SELECT to_regclass('fabric.recovery_result_tasks') IS NOT NULL AS installed")).rows[0]?.installed!==true)return;
 const b=e.binding,ids=[s.tenantId,s.spaceId];
 const task=(await tx.query('SELECT record FROM fabric.recovery_result_tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 FOR SHARE',[...ids,b.run.task.taskId])).rows[0];if(!task)return;
 const config=(task.record as {config:{definitions:readonly unknown[]}}).config;
 if(b.artifactId===null||b.artifactVersion===null||b.artifactDigest===null||!config.definitions.length)throw new FoundationError('STALE_AUTHORITY','Result publication must bind checked bytes');
 const row=(await tx.query('SELECT binding,record FROM fabric.recovery_artifact_versions WHERE tenant_id=$1 AND space_id=$2 AND artifact_id=$3 AND version=$4 FOR SHARE',[...ids,b.artifactId,b.artifactVersion])).rows[0];if(!row)throw new FoundationError('STALE_AUTHORITY');
 const stored=row.record as {artifact:unknown;bytes:string},a=artifactSchema.parse(stored.artifact),latest=(await tx.query('SELECT max(version) AS latest FROM fabric.recovery_artifact_versions WHERE tenant_id=$1 AND space_id=$2 AND artifact_id=$3',[...ids,b.artifactId])).rows[0];
 if(bindingDigest(a.task)!==bindingDigest(b.run.task)||a.digest!==b.artifactDigest||a.version!==b.artifactVersion||bindingDigest(stored.bytes)!==a.digest||bindingDigest((row.binding as {bytes:string}).bytes)!==a.digest||a.verification!=='passed'||Number(latest?.latest)!==b.artifactVersion)throw new FoundationError('STALE_AUTHORITY','Changed result bytes/version or missing verification');
 const checks=(await tx.query('SELECT record FROM fabric.recovery_check_receipts WHERE tenant_id=$1 AND space_id=$2 AND artifact_id=$3 AND version=$4',[...ids,b.artifactId,b.artifactVersion])).rows.map(r=>checkSchema.parse(r.record));
 if(checks.length!==config.definitions.length||!config.definitions.every(definition=>checks.filter(c=>c.definitionDigest===bindingDigest(definition)&&c.status==='passed'&&c.artifactDigest===a.digest&&bindingDigest(c.task)===bindingDigest(b.run.task)&&c.environmentDigest===b.run.environmentDigest&&c.dependencyLockDigest===b.run.dependencyLockDigest).length===1))throw new FoundationError('STALE_AUTHORITY','Stale or missing executed result checks');
}
