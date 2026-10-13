import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { canonicalDigest } from './native-imports.js';
import { ADAPTER_VERSION, LocalPayloadSchema, encodeLocalRequest, type LocalAdapterClient } from './test-adapter.js';
import { LocalQualificationSchema, OperatingProfileSchema, QualifiedProfileSchema, VersionPinsSchema, EncodedRequestSchema, OriginalCallSchema } from './schema.js';
import { timestamp, text } from './decoder.js';
import { demand, ModelError } from './errors.js';
import type { OperatingProfile, LocalQualification, VersionPins, OriginalCall, EncodedRequest } from './contracts.js';

const hash=(value:unknown)=>'sha256:'+canonicalDigest(value);
const bytes=(value:Buffer)=>'sha256:'+createHash('sha256').update(value).digest('hex');
/** Reads actual locally loaded runtime, source/check definitions and independent lock.
 * Never a supplier/environment claim. Caller root is installed, not an API field. */
export async function localQualificationPins(root:string):Promise<Pick<VersionPins,'environmentDigest'|'dependencyLockDigest'|'checkDefinitionDigest'>>{
 demand(process.version==='v22.22.3','QUALIFICATION_MISMATCH');
 const lock=await readFile(resolve(root,'g1-model/pnpm-lock.yaml'));
 const definitions=['src/qualification.ts','src/profile.ts','src/context.ts','src/proposal.ts','src/test-adapter.ts','src/test-adapter-process.ts','src/schema.ts','src/decoder.ts','src/native-session.ts','src/native-repository.ts','src/native-context.ts','src/native-runtime.ts','src/native-service-process.ts','src/native-guard.ts','src/native-computer.ts','src/view.ts','src/model-repository.ts','src/model-service.ts','src/usage-repository.ts','scripts/build.mjs','scripts/runner.mjs','scripts/manifest.mjs'];
 const checks=[];for(const file of definitions)checks.push({file,digest:bytes(await readFile(resolve(root,'g1-model',file)))});
 const packages=[];for(const name of ['pg','typescript','@types/pg','@types/node']){const pkg=JSON.parse(await readFile(resolve(root,'g1-model/node_modules',name,'package.json'),'utf8')) as {version:string};packages.push({name,version:pkg.version});}
 const loadedModules=[];for(const file of ['qualification.js','profile.js','context.js','proposal.js','test-adapter.js','test-adapter-process.js','schema.js','decoder.js','native-session.js','native-repository.js','native-context.js','native-runtime.js','native-service-process.js','native-guard.js','native-computer.js','view.js','model-repository.js','model-service.js','usage-repository.js'])loadedModules.push({file,digest:bytes(await readFile(new URL(file,import.meta.url)))});
 return Object.freeze({environmentDigest:hash({node:process.version,platform:process.platform,architecture:process.arch,postgres:'16.12',packages,loadedModules}),
  dependencyLockDigest:bytes(lock),checkDefinitionDigest:hash(checks)});
}
/** Installed diagnostic-only owner controls; no provider URL or general HTTP callback. */
export interface LocalProbePort {
 readonly client:LocalAdapterClient; readonly ready:{readonly adapterVersion:string;readonly assurance:string};
 original():OriginalCall;
 holdUsage(original:OriginalCall):Promise<void>;
 completeUsage(original:OriginalCall):Promise<void>;
 delay(original:OriginalCall,durationMs:number):Promise<void>;
 capture(original:OriginalCall):Promise<{readonly request:unknown;readonly receipt:unknown;readonly status:string}|undefined>;
 postgresVersion():Promise<string>;
}
/** In-process qualification owner. No import/register/self-attest endpoint.
 * Recreated registries must execute fresh probes. Durable record/review tooling can
 * retain results as history but cannot turn copied JSON into an invocation permit. */
export class QualificationRegistry {
 private readonly records=new Map<string,LocalQualification>();
 private readonly revoked=new Set<string>();
 constructor(private readonly pins:()=>Promise<Pick<VersionPins,'environmentDigest'|'dependencyLockDigest'|'checkDefinitionDigest'>>,private readonly clock:()=>string=()=>new Date().toISOString()){}
 revoke(probeId:string):void{demand(this.records.has(probeId),'QUALIFICATION_MISMATCH');this.revoked.add(probeId);}
 assertCurrent(profile:OperatingProfile,qualification:LocalQualification,pins:VersionPins,now:string):void{
  const p=OperatingProfileSchema.parse(profile),q=QualifiedProfileSchema.parse({profile:p,qualification}).qualification,v=VersionPinsSchema.parse(pins),at=timestamp.parse(now);
  demand(this.records.has(q.probeId)&&canonicalDigest(this.records.get(q.probeId))===canonicalDigest(q),'QUALIFICATION_MISMATCH');
  demand(!q.revoked&&!this.revoked.has(q.probeId)&&q.testedAt<=at&&at<q.expiresAt,'QUALIFICATION_MISMATCH');
  demand(q.adapterVersion===ADAPTER_VERSION&&q.environmentDigest===v.environmentDigest&&q.dependencyLockDigest===v.dependencyLockDigest&&q.checkDefinitionDigest===v.checkDefinitionDigest,'QUALIFICATION_MISMATCH');
 }
 async probe(input:OperatingProfile,port:LocalProbePort,validForMs=60_000):Promise<LocalQualification>{
  const profile=OperatingProfileSchema.parse(input),pins=await this.pins(),testedAt=timestamp.parse(this.clock());
  demand(Number.isSafeInteger(validForMs)&&validForMs>0&&validForMs<=86_400_000,'INVALID_SCHEMA');
  demand(profile.runtimeRequirements.environmentDigest===pins.environmentDigest&&port.ready.adapterVersion===ADAPTER_VERSION&&port.ready.assurance==='deterministic-local-only','QUALIFICATION_MISMATCH');
  demand(/^PostgreSQL 16\.12\b/.test(await port.postgresVersion()),'QUALIFICATION_MISMATCH');
  const c=profile.capabilities;
  // Precisely this version's finite advertised feature set; reject unsupported
  // declarations instead of minting a qualification for untested features.
  demand(c.inputModalities.join(',')==='text'&&c.outputModalities.join(',')==='text'&&c.toolDialect==='local-json-v1'&&c.schemaDialect==='local-closed-json-v1'
   &&c.streaming.text&&c.streaming.toolArguments&&c.contextLimit>=256&&c.contextLimit<=1_048_576&&c.usageReporting==='delayed'
   &&c.cancellation.request&&c.cancellation.lookup&&!c.cancellation.terminationProof&&c.caching.providerPrivateState
   &&!c.caching.promptPrefix&&!c.caching.exactResponse&&!c.caching.semanticResponse&&c.optionalFeatures.length===0&&c.requiredOptionalFeatures.length===0
   &&c.caps.output&&c.caps.duration&&profile.runtimeRequirements.executionClass==='service','REQUIRED_CAPABILITY_UNSUPPORTED');
  const cases:string[]=[];
  const make=(value:string,response:'text'|'tool'='text',privateState:string|null=null,outputCap=256,durationCapMs=1000)=>encodeLocalRequest({schemaVersion:1,original:OriginalCallSchema.parse(port.original()),profileDigest:profile.profileDigest,contextDigest:hash('probe-context'),
   payload:JSON.stringify(LocalPayloadSchema.parse({schemaVersion:1,modality:'text',dialect:'local-json-v1',text:value,response,toolArguments:response==='tool'?{message:'complete ✓'}:null,privateState})),outputCap,durationCapMs,dispatchEpoch:1});
  const refused=async(request:EncodedRequest,code:string)=>{
   let error:unknown;try{await port.client.accept(request);}catch(e){error=e;}
   demand(error instanceof ModelError&&error.code===code,'QUALIFICATION_MISMATCH');demand(await port.capture(request.original)===undefined,'QUALIFICATION_MISMATCH');
  };
  const result=async(request:EncodedRequest)=>{
   await port.completeUsage(request.original);
   const observation=await port.client.lookup(request.original);demand(observation.status==='settled'&&observation.receipt.ownerId===port.client.ownerId,'QUALIFICATION_MISMATCH');
   const capture=await port.capture(request.original);demand(capture&&canonicalDigest(EncodedRequestSchema.parse(capture.request))===canonicalDigest(request)
    &&canonicalDigest(capture.receipt)===canonicalDigest(observation.receipt),'QUALIFICATION_MISMATCH');
   const r=await port.client.result(request.original);
   demand(r.output!==null,'QUALIFICATION_MISMATCH');demand(observation.receipt.measuredUnits===2+Buffer.byteLength(request.payload)+Buffer.byteLength(r.output),'QUALIFICATION_MISMATCH');
   if(observation.receipt.outcome==='answer')demand(observation.receipt.outputDigest===hash(r.output),'QUALIFICATION_MISMATCH');
   return {receipt:observation.receipt,result:r};
  };
  const first=make('probe 🌍');await port.holdUsage(first.original);demand((await port.client.accept(first)).status==='accepted','QUALIFICATION_MISMATCH');
  demand((await port.client.lookup(first.original)).status==='accepted'&&(await port.client.result(first.original)).output===null,'QUALIFICATION_MISMATCH');cases.push('delayed-usage-and-lookup');
  const known=await result(first);demand(known.result.output==='local:probe 🌍'&&known.result.privateState,'QUALIFICATION_MISMATCH');
  let chunks='';for await(const frame of port.client.stream(first.original)){demand(frame.kind==='text','QUALIFICATION_MISMATCH');chunks+=frame.fragment;}
  demand(chunks===known.result.output,'QUALIFICATION_MISMATCH');cases.push('text-stream-capture-known-usage');
  const tool=make('proposal','tool');await port.holdUsage(tool.original);await port.client.accept(tool);const proposed=await result(tool);chunks='';
  for await(const frame of port.client.stream(tool.original)){demand(frame.kind==='tool-arguments','QUALIFICATION_MISMATCH');chunks+=frame.fragment;}
  demand(chunks===proposed.result.output&&chunks===JSON.stringify({message:'complete ✓'}),'QUALIFICATION_MISMATCH');cases.push('complete-local-tool-dialect-stream');
  const empty=make(''),padding=c.contextLimit-Buffer.byteLength(empty.payload),boundary=make('x'.repeat(padding));
  demand(Buffer.byteLength(boundary.payload)===c.contextLimit,'QUALIFICATION_MISMATCH');await port.holdUsage(boundary.original);await port.client.accept(boundary);await result(boundary);
  await refused(make('x'.repeat(padding+1)),'REQUIRED_CAPABILITY_UNSUPPORTED');cases.push('encoded-context-exact-and-over-limit');
  const capped=make('unicode 🌍','text',null,7);await port.holdUsage(capped.original);await port.client.accept(capped);const clipped=await result(capped);demand(Buffer.byteLength(clipped.result.output!)<=7&&clipped.result.output!.isWellFormed(),'QUALIFICATION_MISMATCH');
  const duration=make('deadline','text',null,256,1);await port.delay(duration.original,20);await port.client.accept(duration);const timed=await result(duration);demand(timed.receipt.outcome==='known-failure','QUALIFICATION_MISMATCH');cases.push('output-and-duration-caps');
  const cancelled=make('cancel');await port.holdUsage(cancelled.original);await port.client.accept(cancelled);demand((await port.client.cancel(cancelled.original)).status==='accepted','QUALIFICATION_MISMATCH');
  const stopped=await result(cancelled);demand(stopped.receipt.outcome==='cancelled','QUALIFICATION_MISMATCH');cases.push('cancel-request-not-termination-proof');
  const reused=make('private reuse','text',known.result.privateState);await port.holdUsage(reused.original);await port.client.accept(reused);await result(reused);
  const different=make('private changed','text',known.result.privateState),changed=encodeLocalRequest({...different,contextDigest:hash('changed-manifest')});await refused(changed,'SCOPE_MISMATCH');cases.push('provider-private-current-manifest-scope');
  for(const [name,value]of [['modality','image'],['modality','audio'],['dialect','arbitrary']]as const){const base=make('unsupported');await refused(encodeLocalRequest({...base,payload:JSON.stringify({...JSON.parse(base.payload),[name]:value})}),'REQUIRED_CAPABILITY_UNSUPPORTED');}
  cases.push('unsupported-modalities-and-dialect');
  demand(cases.length===8,'QUALIFICATION_MISMATCH');
  const finalPins=await this.pins();demand(canonicalDigest(finalPins)===canonicalDigest(pins),'QUALIFICATION_MISMATCH');
  const expiresAt=new Date(new Date(testedAt).getTime()+validForMs).toISOString();demand(timestamp.parse(this.clock())<expiresAt,'QUALIFICATION_MISMATCH');
  const q=LocalQualificationSchema.parse({schemaVersion:1,qualificationId:randomUUID(),profileId:profile.profileId,profileVersion:profile.profileVersion,profileDigest:profile.profileDigest,
   capabilitiesDigest:hash(profile.capabilities),adapterVersion:text.parse(port.ready.adapterVersion),deployment:profile.deployment,...pins,probeId:randomUUID(),testedAt,expiresAt,executedCases:cases,assurance:'deterministic-local-only',revoked:false});
  this.records.set(q.probeId,q);return q;
 }
}
