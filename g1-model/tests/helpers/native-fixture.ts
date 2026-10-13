import { randomUUID,createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createUsageFixture } from './usage-fixture.js';
import { profileFixture,sha } from './contract-fixtures.js';
import { localQualificationPins,QualificationRegistry,type LocalProbePort } from '../../src/qualification.js';
import { OperatingProfileSchema,profileDigestOf,VersionPinsSchema,SourceRecordSchema } from '../../src/schema.js';
import { ProfileRegistry,ProfileNeedSchema,type ProfileNeed } from '../../src/profile.js';
import { sourceRevisionDigestOf,descriptorOf } from '../../src/context.js';
import { composeNative } from '../../src/native-runtime.js';
import { AdmissionSchema,type NativeAdmission } from '../../src/native-repository.js';
import { migrateNativeControls } from '../../src/native-migration.js';
import { PostgresTaskRepository } from '../../../g1-foundations/src/task-repository.js';
import { audienceDigest,type AudienceRow } from '../../../g1-identity/src/audience.js';
import { hash } from '../../src/model-repository.js';
import type { OriginalCall,VerifiedScope,TaskCallBinding } from '../../src/contracts.js';
import type { SourceDescriptor } from '../../src/context.js';
import { launchOwned,stopOwned,waitUntil,type OwnedProcess } from './process-fixture.js';
import type { SyntheticResourceOwner } from '../../src/resource-contract.js';
import type { OperatingProfile } from '../../src/contracts.js';
import { demand } from '../../src/errors.js';
export async function createNativeFixture(){
 const root=process.env['MODEL_REPO_ROOT']!;const digestFile=async(file:string)=>'sha256:'+createHash('sha256').update(await readFile(resolve(root,file))).digest('hex');
 const pins=VersionPinsSchema.parse({schemaVersion:1,engineDigest:await digestFile('engine/kernel/src/session-loop.ts'),behaviorDigest:await digestFile('g1-model/src/native-session.ts'),schemaDigest:await digestFile('g1-model/src/schema.ts'),...await localQualificationPins(root)});
 const raw={...profileFixture(),capabilities:{...profileFixture().capabilities,contextLimit:32_768},runtimeRequirements:{...profileFixture().runtimeRequirements,environmentDigest:pins.environmentDigest}},profile=OperatingProfileSchema.parse({...raw,profileDigest:profileDigestOf(raw)});
 const l=await createUsageFixture({pins,profile,computerGrant:true}),f=l.f,children:OwnedProcess[]=[];
 try{
  if(!(await f.admin.query('SELECT 1 FROM public.fabric_model_migrations WHERE version=6')).rowCount){await migrateNativeControls(f.admin,{ownedSyntheticDatabase:true,owner:f.fixtureOwner,root,injectBeforeCommit:true}).then(()=>{throw new Error('Native migration rollback absent');},e=>{if(e.message!=='Injected native migration rollback')throw e;});demand((await f.admin.query("SELECT to_regclass('fabric.model_native_controls') AS table")).rows[0].table===null);}
  await migrateNativeControls(f.admin,{ownedSyntheticDatabase:true,owner:f.fixtureOwner,root});
  const probePort:LocalProbePort={client:f.adapterClient(),ready:{adapterVersion:String(f.adapter().ready['adapterVersion']),assurance:String(f.adapter().ready['assurance'])},original:f.original,holdUsage:o=>f.schedule(o,{usage:'manual'}),completeUsage:f.finalize,delay:(o,ms)=>f.schedule(o,{usage:'manual',durationMs:ms}),capture:f.journal,postgresVersion:async()=>String((await f.admin.query('SELECT version() AS v')).rows[0].v)};
  const q=new QualificationRegistry(()=>localQualificationPins(root)),qualification=await q.probe(profile,probePort,300_000);
  const profiles=new ProfileRegistry(q,()=>({schemaVersion:1,providers:[profile.provider],routes:[profile.route],regions:[profile.region],dataPolicies:[profile.dataPolicy],runtimeProfiles:[profile.runtimeRequirements.profileId]}),[{profile,qualification,organizationApproved:true,available:true}],{Fast:[profile.profileId],Balanced:[profile.profileId],Thorough:[profile.profileId]});
  const source=await l.task({commonCeiling:10_000_000});
  const audience=await f.uow.withScope(source.scope,async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[f.space,f.space,source.binding.taskId])).rows[0]?.['audience'] as AudienceRow[]);
  const record=SourceRecordSchema.parse({sourceId:randomUUID(),revision:2,digest:hash('NATIVE_SOURCE_PRIVATE_MARKER'),scope:{tenantId:f.tenant,spaceId:f.space},audience:{destinationSpaceId:f.space,recipientActorIds:audience.map(r=>r.actorId),revisionDigest:audienceDigest(audience)},provenance:'native-current-task-source',observedAt:new Date().toISOString(),trust:'untrusted-observation',kind:'evidence',content:'NATIVE_SOURCE_PRIVATE_MARKER'}),descriptor=descriptorOf(record,source.binding.taskId);
  await new PostgresTaskRepository(f.uow).revise(source.scope,source.binding.taskId,1,JSON.parse(JSON.stringify({contextSources:{[record.sourceId]:{descriptor,record}}})));
  const descriptors=new Map<string,readonly SourceDescriptor[]>(),approved=new Set<string>(),counters={provision:0,wake:0,enroll:0,effect:0},chunks:string[]=[];
  const need=ProfileNeedSchema.parse({schemaVersion:1,inputModalities:['text'],outputModalities:['text'],toolDialect:'local-json-v1',schemaDialect:'local-closed-json-v1',streamText:true,streamToolArguments:false,contextBytes:8192,outputCap:32,durationCapMs:1000,usage:true,cancellation:true,privateState:false,optionalFeatures:[],executionClass:'service',runtimeCapabilities:['model-text']});
  const admission=async(_tx:unknown,_scope:VerifiedScope,s:{admission:NativeAdmission;binding:{sessionId:string;intent:string}})=>s.admission.approvalRequired&&!approved.has(s.binding.sessionId)?'approval' as const:s.admission.targetEffect&&s.binding.intent!=='Act'?'permission' as const:null;
  const runtime=()=>composeNative({uow:f.uow,bindingFor:f.bindingFor,pins,profile,profiles,adapter:f.adapterClient(),descriptors,admission,publishChunk:async fragment=>{chunks.push(fragment);}});
  const native=runtime();
  async function task(options:{purpose?:TaskCallBinding['purpose'];category?:TaskCallBinding['category'];ceiling?:number;approval?:boolean;reason?:'resource'|'permission'|'connection';parentTaskId?:string;intent?:'Ask'|'Plan'|'Act';noSources?:boolean;computer?:boolean;executionClass?:'target';resourceId?:string;need?:ProfileNeed;space?:string;refs?:readonly SourceDescriptor[];maxInputBytes?:number;targetEffect?:boolean}={}){
   const refs=options.refs??(options.noSources?[]:[descriptor]),value=await l.task({ceiling:options.ceiling??100_000,commonCeiling:10_000_000,sourceRevisionDigest:sourceRevisionDigestOf(refs),...(options.purpose?{purpose:options.purpose}:{}),...(options.category?{category:options.category}:{}),...(options.space?{space:options.space}:{}),...(options.parentTaskId?{parentTaskId:options.parentTaskId}:{}),...(options.intent?{intent:options.intent}:{})});
   descriptors.set(value.binding.sessionId,refs);
   const admitted=AdmissionSchema.parse({executionClass:options.computer?'computer':options.executionClass??'service',computerCapability:options.computer?'simulated-computer':null,maxInputBytes:options.maxInputBytes??64,need:options.need??need,approvalRequired:options.approval??false,targetEffect:options.targetEffect??false,resourceId:options.computer?(options.resourceId??randomUUID()):null,ongoingCharges:options.approval?['reserved-compute','retained-storage']:[]});
   await native.repository.open(value.scope,value.binding.runId,admitted);
   return {...value,sessionId:value.binding.sessionId,admission:admitted};
  }
  let approvedEquivalentRetries:readonly (readonly [string,string])[]=[];
  let resourceOwner:SyntheticResourceOwner|undefined;let additionalProfiles:readonly {profile:OperatingProfile;url:string;ownerId:string;available:boolean}[]=[];
  const additionalAdapters=new Map<string,Awaited<ReturnType<typeof f.additionalAdapter>>>();
  async function installAdditionalProfiles(values:readonly OperatingProfile[],availableProfileIds:readonly string[]=[]){
   const parsed=values.map(value=>OperatingProfileSchema.parse(value));
   demand(new Set(parsed.map(value=>value.profileId)).size===parsed.length&&parsed.every(value=>value.profileId!==profile.profileId&&!additionalAdapters.has(value.profileId)),'IDEMPOTENCY_CONFLICT');
   demand(availableProfileIds.every(id=>parsed.some(p=>p.profileId===id)));
   const entries:{profile:OperatingProfile;url:string;ownerId:string;available:boolean}[]=[];
   for(const value of parsed){const owner=await f.additionalAdapter(value);additionalAdapters.set(value.profileId,owner);entries.push({profile:owner.profile,url:owner.url(),ownerId:owner.ownerId,available:availableProfileIds.includes(value.profileId)});}
   additionalProfiles=[...additionalProfiles,...entries];
  }
  function config(index=1){return {root,approvalOwnerInstalled:true,...(resourceOwner?{resourceOwnerId:resourceOwner.ownerId}:{}),additionalProfiles:additionalProfiles.map(e=>({...e,url:additionalAdapters.get(e.profile.profileId)!.url()})),approvedEquivalentRetries,controllerDsn:f.fixtureDsn('controller'),authorityDsn:f.fixtureDsn('authority'),token:f.tokens[index],tenantId:f.tenant,spaceId:f.space,issuer:f.endpoints['issuer'],jwksUrl:f.endpoints['jwksUrl'],url:f.adapterUrl(),transportToken:f.transportToken,ownerId:f.ownerId,profile,pins,descriptors:[...descriptors]};}
  async function process(index=1,prepareFault?:'lost-ack'|'crash-after-commit'){const script=prepareFault?'g1-model/tests/helpers/native-prepare-recovery-process.js':'g1-model/src/native-service-process.js';const child=await launchOwned(resolve(root,'g1-model/node_modules/.cache/model-build',script),'FABRIC_MODEL_NATIVE_SERVICE',{...config(index),...(prepareFault?{prepareFault}:{})});children.push(child);
   child.child.on('message',raw=>{const m=raw as {kind:string;requestId:string;action:string;original:OriginalCall;durationMs:number;controlId:string;profileId?:string};if(m.kind!=='probe-control')return;
    const work=(async()=>{
     if(m.action==='approval')return approved.has(m.controlId);
     if(m.action==='resourceReceipt')return resourceOwner?.receipt(m.controlId);if(m.action==='resourceSuspension')return resourceOwner?.suspension(m.controlId);
     const owner=m.profileId===undefined||m.profileId===profile.profileId?f:additionalAdapters.get(m.profileId);demand(owner,'CHECK_BINDING_MISMATCH');
     if(m.action==='holdUsage')return owner.schedule(m.original,{usage:'manual'});if(m.action==='completeUsage')return owner.finalize(m.original);if(m.action==='delay')return owner.schedule(m.original,{usage:'manual',durationMs:m.durationMs});if(m.action==='capture')return owner.journal(m.original);if(m.action==='postgresVersion')return (await f.admin.query('SELECT version() AS v')).rows[0].v;
     throw new Error('Invalid probe control');
    })();
    void work.then(result=>child.child.send({kind:'probe-response',requestId:m.requestId,result}),()=>child.child.send({kind:'probe-response',requestId:m.requestId,failed:true}));
   });return child;
  }
  async function call(child:OwnedProcess,kind:string,input:unknown){const requestId=randomUUID();await new Promise<void>((done,reject)=>child.child.send({kind,requestId,input},e=>e?reject(e):done()));await waitUntil(async()=>child.messages.some(m=>m['kind']==='result'&&m['requestId']===requestId),'native operator '+kind,15_000);const response=child.messages.find(m=>m['kind']==='result'&&m['requestId']===requestId)!;return response;}
  const snapshot=async()=>{const s=await l.snapshot();for(const table of ['model_native_controls','model_no_dispatch','recovery_task_controls','recovery_fence_receipts','recovery_fence_events','model_computer_assignments','model_computer_preflights'])s[table]=(await f.admin.query("SELECT coalesce(jsonb_agg(record ORDER BY record::text),'[]') AS rows FROM (SELECT to_jsonb(a) AS record FROM fabric."+table+" a) s")).rows[0].rows;return s;};
  return {...l,pins,profile,source,descriptor,record,need,profiles,q,qualification,probePort,native,runtime,task,descriptors,approved,counters,chunks,process,call,snapshot,installResourceOwner:(owner:SyntheticResourceOwner)=>{resourceOwner=owner;},installAdditionalProfiles,additionalAdapters,approveEquivalentRetries:(pairs:readonly (readonly [string,string])[])=>{approvedEquivalentRetries=pairs;},
   command:async(sessionId:string)=>({sessionId,key:randomUUID(),expectedRevision:(await native.session.inspect(f.issued[1]!,sessionId)).revision,expiresAt:new Date(Date.now()+60_000).toISOString()}),
   close:async()=>{const results=await Promise.allSettled(children.map(c=>stopOwned(c)));await l.close();const bad=results.filter(r=>r.status==='rejected');if(bad.length)throw new AggregateError(bad.map(r=>(r as PromiseRejectedResult).reason));}};
 }catch(e){await Promise.allSettled(children.map(c=>stopOwned(c)));await l.close();throw e;}
}
