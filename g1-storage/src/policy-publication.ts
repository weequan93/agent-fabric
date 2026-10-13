import { createHash,randomUUID } from 'node:crypto';
import { object,uuid,timestamp } from './decoder.js';
import { demand,StorageError } from './errors.js';
import { revalidateScope,type VerifiedScope,type SqlTransaction } from './owners.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { StoragePolicySchema,EpochAnchorSchema,controlDigest } from './authority.js';
import { assertPolicyReduction } from './policy-reduction.js';
import { EpochPublicationRepository } from './epoch-publication.js';
import type { PendingEpoch } from './epoch-journal.js';
const CommandSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp,policy:StoragePolicySchema});
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Local enrolled policy reductions only. Exact desired policy is a closed
 * authenticated command, never an anchor/epoch input. Recovery shares the same
 * original-key namespace and independent pending witness as epoch refresh. */
export class PolicyPublicationRepository extends EpochPublicationRepository {
 protected override async locks(tx:SqlTransaction,scope:VerifiedScope,key:string){
  await super.locks(tx,scope,key);demand(scope.grants.includes('storage:policy-admin'),'UNAUTHORIZED');
 }
 override async refresh(_scope:VerifiedScope,_raw:unknown):Promise<never>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');}
 async reduce(scope:VerifiedScope,raw:unknown){
  const command=CommandSchema.parse(raw),binding=hash(command);
  await this.uow.withScope(scope,async tx=>{
   await this.locks(tx,scope,command.key);
   demand(!await this.original(tx,scope,command.key),'IDEMPOTENCY_CONFLICT');
   await this.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   const previous=await this.authority.check(tx,scope,'maintenance',command.expiresAt);
   const row=(await tx.query('SELECT periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',[scope.tenantId,scope.spaceId,previous.policyRevision])).rows[0];
   demand(row,'AUTHORITY_UNAVAILABLE');const previousPolicy=StoragePolicySchema.parse(row);assertPolicyReduction(previousPolicy,command.policy);
   const revision=Number((await tx.query('SELECT max(revision)+1 AS revision FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2',[scope.tenantId,scope.spaceId])).rows[0]?.['revision']);
   const next=EpochAnchorSchema.parse({epoch:previous.epoch+1,anchorId:randomUUID(),policyRevision:revision,
    controlDigest:await controlDigest(tx,scope.tenantId,scope.spaceId,revision,command.policy)});
   const pending:PendingEpoch={schemaVersion:2,kind:'policy-reduction',actorId:scope.actorId,key:command.key,binding,sessionId:command.sessionId,expiresAt:command.expiresAt,previous,next,previousPolicy,nextPolicy:command.policy};
   await this.journal.reserve(scope.tenantId,scope.spaceId,pending);await this.hooks.afterReserve?.();
   await tx.query('SELECT fabric.storage_reduce_policy($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)',[command.key,binding,command.sessionId,previous.epoch,previous.anchorId,next.anchorId,previous.controlDigest,next.controlDigest,previous.policyRevision,next.policyRevision,JSON.stringify(command.policy.periods),JSON.stringify(command.policy.operations),command.expiresAt]);
   await this.hooks.afterPublication?.(tx);
   const native=await this.native.load(tx,scope,command.sessionId);await this.native.fresh(tx,scope,native);
   await this.authority.currentAudience(tx,scope,native.binding.taskId);
   demand(await controlDigest(tx,scope.tenantId,scope.spaceId,next.policyRevision)===next.controlDigest,'AUTHORITY_UNAVAILABLE');
   await currentScope(tx,scope);await revalidateScope(scope);
   demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[command.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
  });
  await this.hooks.beforeWitnessAck?.();return this.lookup(scope,command);
 }
 override async lookup(scope:VerifiedScope,raw:unknown){
  const command=CommandSchema.parse(raw);return this.reconcile(scope,command,hash(command));
 }
 protected override async inspectOriginal(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  const marker=(await tx.query('SELECT c.policy_revision,c.previous_policy_revision,p.periods,p.operations FROM fabric.storage_policy_changes c JOIN fabric.storage_policy p ON p.tenant_id=c.tenant_id AND p.space_id=c.space_id AND p.revision=c.policy_revision WHERE c.tenant_id=$1 AND c.space_id=$2 AND c.actor_id=$3 AND c.command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,row['command_key']])).rows[0];
  demand(marker&&Number(marker['policy_revision'])===Number(row['policy_revision'])&&Number(marker['previous_policy_revision'])<Number(marker['policy_revision']),'AUTHORITY_UNAVAILABLE');
 }
}
