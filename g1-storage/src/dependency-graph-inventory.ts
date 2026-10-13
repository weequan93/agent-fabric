import { RECORD_INVENTORY,CONTROL_INVENTORY,EXCLUDED_FROM_BACKUP } from './record-inventory.js';
const freeze=<T>(v:T):Readonly<T>=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
/** Versioned additive inventory: the accepted V1 owner descriptions stay intact.
 * These opaque prepared binary projections qualify dependency custody; semantic
 * summary/index workers, embeddings and their resource admission are separate. */
export const GRAPH_RECORD_INVENTORY=freeze({schemaVersion:1,
 predecessor:RECORD_INVENTORY,
 payload:{owner:'memory-projection',store:'storage_graph_payloads',classes:['summary','index','cache'],schema:'GraphDerivedPayloadSchema',
  encrypted:['bytes','dependencies'],opaque:['tenant_id','space_id','class','id','revision','witness'],
  maxDecodedBytes:524288,commit:'same-transaction-head-graph-and-ciphertext',recovery:'exact-original-head-lookup-no-replay',retention:'current-ancestry-before-open-and-release'},
 controls:{
  storage_graph_nodes:['tenant_id','space_id','class','id','revision','witness','source_task_id','key_id','generation','expires_at','backing_class','backing_id','backing_revision','backing_witness','ask_id','dependency_count','dependency_digest'],
  storage_graph_edges:['tenant_id','space_id','child_class','child_id','child_revision','child_witness','parent_class','parent_id','parent_revision','parent_witness'],
  storage_graph_payloads:['tenant_id','space_id','class','id','revision','witness','envelope'],
  storage_graph_ask_extras:['tenant_id','space_id','ask_id','parent_class','parent_id','parent_revision','parent_witness'],
  storage_graph_events:['tenant_id','space_id','actor_id','command_key','reason','class','id','revision'],
  storage_graph_jobs:['tenant_id','space_id','actor_id','command_key','job_id','status','class','id','revision','witness']
 },
 predecessorControls:CONTROL_INVENTORY,
 excludedAsRestoreAuthority:[...EXCLUDED_FROM_BACKUP,'graph-original-event-authority','graph-pending-jobs','graph-ancestry-read-authority'],
 backupCaptureQualification:'pending',externalCopies:null,completedErasure:false});
