import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { VerifiedScope,SqlTransaction } from '../../src/owners.js';
import { StorageAuthorityRepository,StoragePolicySchema,controlDigest,type EpochAnchor } from '../../src/authority.js';
import type { createStorageFixture } from './pg-fixture.js';
export function transaction(client:PoolClient):SqlTransaction{return {async query<Row extends Record<string,unknown>>(sql:string,values:readonly unknown[]=[]){const r=await client.query<Row>(sql,[...values]);return {rows:r.rows,rowCount:r.rowCount};}};}
export async function enrollAuthority(f:Awaited<ReturnType<typeof createStorageFixture>>,retentionSeconds=60){
 const anchors=new Map<string,EpochAnchor>(),key=(s:VerifiedScope)=>s.tenantId+'/'+s.spaceId;
 const periods={source:retentionSeconds,knowledge:retentionSeconds,artifact:retentionSeconds,draft:retentionSeconds,'live-file':retentionSeconds,checkpoint:retentionSeconds,summary:retentionSeconds,index:retentionSeconds,cache:retentionSeconds,ask:retentionSeconds,backup:retentionSeconds};
 const policy=StoragePolicySchema.parse({periods,operations:['read','write','forget','backup','restore','maintenance','share']});
 for(const [kind,space] of Object.entries(f.spaces)){
  const tenant=kind==='foreign'?f.foreignTenant:f.tenant;
  await f.admin.query('INSERT INTO fabric.storage_rooms VALUES($1,$2,$3)',[tenant,space,kind==='foreign'||kind==='secondary'||kind==='lifecycle'||kind==='pending'?'group':kind]);
  await f.admin.query('INSERT INTO fabric.storage_policy VALUES($1,$2,1,$3::jsonb,$4::jsonb)',[tenant,space,JSON.stringify(policy.periods),JSON.stringify(policy.operations)]);
 }
 /** Fixture-only authority publication; SQL transaction and witness ACK are
  * independently held. This is not the future canonical mutation protocol. */
 async function publish(s:VerifiedScope,work?:(c:PoolClient,epoch:number)=>Promise<void>,policyRevision=1){
  const c=await f.admin.connect();let anchor:EpochAnchor;
  try{
   await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',s.tenantId,s.spaceId])]);
   const epoch=Number((await c.query('SELECT coalesce(max(epoch),0)+1 AS epoch FROM fabric.storage_authority_epoch WHERE tenant_id=$1 AND space_id=$2',[s.tenantId,s.spaceId])).rows[0].epoch);
   await work?.(c,epoch);
   anchor={epoch,anchorId:randomUUID(),policyRevision,controlDigest:await controlDigest(transaction(c),s.tenantId,s.spaceId,policyRevision)};
   await c.query('INSERT INTO fabric.storage_authority_epoch VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[s.tenantId,s.spaceId,epoch,anchor.anchorId,policyRevision,anchor.controlDigest]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  anchors.set(key(s),Object.freeze(anchor));return anchor;
 }
 for(const s of [f.scope,await f.scopeFor(f.actors[0],f.spaces.personal),await f.scopeFor(f.actors[0],f.spaces.share),await f.scopeFor(f.foreignActor,f.spaces.foreign),await f.scopeFor(f.actors[0],f.spaces.secondary),await f.scopeFor(f.actors[0],f.spaces.lifecycle),await f.scopeFor(f.actors[0],f.spaces.pending)])await publish(s);
 async function share(source:VerifiedScope,destination:VerifiedScope,ref:{id:string;revision:number;sourceTaskId:string},relationId=randomUUID(),status:'active'|'revoked'='active'){
  const c=await f.admin.connect();let anchor:EpochAnchor;
  try{
   await c.query('BEGIN');
   for(const s of [source.spaceId,destination.spaceId].sort())await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',destination.tenantId,s])]);
   const epoch=Number((await c.query('SELECT coalesce(max(epoch),0)+1 AS epoch FROM fabric.storage_authority_epoch WHERE tenant_id=$1 AND space_id=$2',[destination.tenantId,destination.spaceId])).rows[0].epoch);
   const revision=Number((await c.query('SELECT coalesce(max(revision),0)+1 AS revision FROM fabric.storage_shares WHERE tenant_id=$1 AND destination_space_id=$2 AND relation_id=$3',[destination.tenantId,destination.spaceId,relationId])).rows[0].revision);
   const sourceEpoch=anchors.get(key(source))!.epoch;
   await c.query("INSERT INTO fabric.storage_shares VALUES($1,$2,$3,$4,$5,'source',$6,$7,$8,$9,$10,$11)",[destination.tenantId,destination.spaceId,relationId,revision,source.spaceId,ref.id,ref.revision,ref.sourceTaskId,status,sourceEpoch,epoch]);
   anchor={epoch,anchorId:randomUUID(),policyRevision:1,controlDigest:await controlDigest(transaction(c),destination.tenantId,destination.spaceId,1)};
   await c.query('INSERT INTO fabric.storage_authority_epoch VALUES($1,$2,$3,$4,1,$5,clock_timestamp())',[destination.tenantId,destination.spaceId,epoch,anchor.anchorId,anchor.controlDigest]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  anchors.set(key(destination),Object.freeze(anchor));return relationId;
 }
 const authority=new StorageAuthorityRepository({current:async(t,s)=>anchors.get(t+'/'+s)},f.native);
 return {authority,anchors,key,publish,share,policy};
}
