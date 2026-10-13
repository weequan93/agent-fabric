import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {VolumeDraftRepository,type VolumeCommand,type VolumeDraftHooks} from '../../src/volume-drafts.js';
import {EpochWitnessJournal,type OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {StagingWitnessJournal} from '../../src/staging-witness.js';
import {CryptoStore} from '../../src/crypto-store.js';
import {demand} from '../../src/errors.js';
import type {AsyncUnitOfWork,NativeRepository,VerifiedScope} from '../../src/owners.js';
export const volumeId=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
/** The same trusted fixture controls/validator as the existing volume adapters.
 * This constructs the installed owner; it implements no storage behavior. */
export function volumeVerificationOwner(c:{uow:AsyncUnitOfWork;native:NativeRepository;scope:VerifiedScope;crypto:CryptoStore;authorityRoot:OwnedAnchorRoot;root:OwnedAnchorRoot;witnessRoot:OwnedAnchorRoot;keyId:string;generation:string;commands:readonly VolumeCommand[];retentionExpiresAt:string;valid?:boolean;currentGeneration?:string},hooks:VolumeDraftHooks={}){
 const fingerprints=new Map<string,string>();
 return new VolumeDraftRepository(c.uow,new EpochWitnessJournal(c.authorityRoot),c.native,c.crypto,c.root,new StagingWitnessJournal(c.witnessRoot),{
  current:async()=>({rootId:c.root.rootId,keyId:c.keyId,generation:c.currentGeneration??c.generation}),
  resolve:async(_tx,s)=>{demand(s.tenantId===c.scope.tenantId&&s.spaceId===c.scope.spaceId,'SCOPE_MISMATCH');return {rootId:c.root.rootId,keyId:c.keyId,generation:c.currentGeneration??c.generation,retentionExpiresAt:c.retentionExpiresAt};}
 },{require:async(tx,s,r)=>{
  demand(c.valid!==false,'AUTHORITY_UNAVAILABLE');demand(s.tenantId===c.scope.tenantId&&s.spaceId===c.scope.spaceId&&s.actorId===c.scope.actorId,'UNAUTHORIZED');
  const command=c.commands.find(v=>r.validationId===(v.action==='promote'?v.validationId:volumeId(['storage-volume-validation-v1',s.tenantId,s.spaceId,s.actorId,v.key])));demand(command,'CHECK_BINDING_MISMATCH');
  assert.deepEqual(r.binding,{schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'artifact',id:volumeId(['storage-volume-artifact-v1',s.tenantId,s.spaceId,s.actorId,command.key]),revision:1,keyId:c.keyId,generation:c.generation});
  const old=fingerprints.get(command.key);if(old)demand(old===r.commandFingerprint,'CHECK_BINDING_MISMATCH');else fingerprints.set(command.key,r.commandFingerprint);
  demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[command.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
 }},hooks);
}
