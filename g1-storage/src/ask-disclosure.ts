import { uuid } from './decoder.js';
import { LIMITS } from './arithmetic.js';
import { demand } from './errors.js';
import { assertVerifiedScope,revalidateScope,type SqlTransaction,type VerifiedScope } from './owners.js';
import type { SourceRecallBroker } from './recall-broker.js';

/** Installed bounded disclosure barrier. The local profile has one canonical
 * source Space; shared/remote dependencies require a separately qualified path.
 * The complete Space set is sorted before any native/entity lock. */
export class DisclosureBarrier {
 constructor(readonly broker:SourceRecallBroker){}
 async lock(tx:SqlTransaction,s:VerifiedScope,raw:readonly string[]){
  assertVerifiedScope(s);await revalidateScope(s);
  demand(raw.length>0&&raw.length<=LIMITS.selected+1,'REQUIRED_CAPABILITY_UNSUPPORTED');
  const spaces=[...new Set(raw.map(v=>uuid.parse(v)))].sort();
  demand(spaces.every(v=>v===s.spaceId),'REQUIRED_CAPABILITY_UNSUPPORTED');
  for(const space of spaces)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',s.tenantId,space])]);
  await revalidateScope(s);return spaces;
 }
 async dependencies(tx:SqlTransaction,s:VerifiedScope,rows:readonly Record<string,unknown>[],keys:{keyId:string;generation:string}){
  demand(rows.length<=LIMITS.selected,'REQUIRED_CAPABILITY_UNSUPPORTED');
  const current=[];
  // Stored ordinal gives the answer/manifest order. Authorization acquisition is
  // canonical regardless of user selector order; every enrolled mutation also
  // takes the Space barrier, so no unbounded dependency lock chain is possible.
  for(const d of [...rows].sort((a,b)=>String(a['knowledge_id']).localeCompare(String(b['knowledge_id'])))){
   const id=uuid.parse(d['knowledge_id']),revision=Number(d['knowledge_revision']),witness=d['knowledge_witness'];
   const row=(await tx.query('SELECT * FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[s.tenantId,s.spaceId,id,revision])).rows[0];
   demand(row&&row['witness']===witness&&row['key_id']===keys.keyId&&row['generation']===keys.generation&&row['source_id']===d['source_id']&&Number(row['source_revision'])===Number(d['source_revision']),'CONTENT_UNAVAILABLE');
   await this.broker.authority.entity(tx,s,{class:'knowledge',id,revision,witness});
   await this.broker.authority.entity(tx,s,{class:'source',id:row['source_id'],revision:Number(row['source_revision']),witness:row['source_witness']});
   await this.broker.admission.recallEligibility(tx,s,row);await this.broker.admission.conflictEligibility(tx,s,row);
   demand(['user-asserted','source-verified'].includes(String(row['status'])),'CONTENT_UNAVAILABLE');
   const a=await this.broker.authority.currentAudience(tx,s,uuid.parse(row['source_task_id']));
   current.push({ordinal:Number(d['ordinal']),id,revision,witness,sourceId:row['source_id'],sourceRevision:Number(row['source_revision']),sourceWitness:row['source_witness'],sourceTaskId:row['source_task_id'],audience:{destinationSpaceId:s.spaceId,recipientActorIds:a.recipientActorIds,revisionDigest:a.revisionDigest}});
  }
  return current.sort((a,b)=>a.ordinal-b.ordinal);
 }
}
