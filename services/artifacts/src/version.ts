import { createHash } from 'node:crypto';
import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, type ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';

export type ArtifactVersionStatus = 'draft' | 'candidate' | 'accepted';
export interface ArtifactVersion {
  scope:ScopeRef;artifactId:string;versionId:string;baseRevision:number;revision:number;
  digest:string;content:string;status:ArtifactVersionStatus;conflict:boolean;committedArtifactId:string|null;
}
export interface DraftInput {scope:ScopeRef;artifactId:string;versionId:string;content:string;expectedBaseRevision:number}
interface ArtifactHead {scope:ScopeRef;artifactId:string;revision:number;acceptedVersionId:string|null}
function key(scope:ScopeRef,id:string):string {const s=parseScope(scope);return JSON.stringify([s.tenantId,s.spaceId,nonEmptyString(id)]);}
function versionKey(scope:ScopeRef,artifactId:string,versionId:string):string {return JSON.stringify([key(scope,artifactId),nonEmptyString(versionId)]);}
function sameDraft(a:ArtifactVersion,b:ArtifactVersion):boolean {return a.digest===b.digest&&a.content===b.content&&a.baseRevision===b.baseRevision;}
/** Trusted owner module; committing a version never deploys or delivers it. */
export class ArtifactVersionRepository {
  private readonly heads=new Map<string,ArtifactHead>();private readonly versions=new Map<string,ArtifactVersion>();private readonly versionBindings=new Map<string,string>();
  constructor(private readonly authorize:(scope:ScopeRef)=>void,private readonly assertCommitted:(scope:ScopeRef,artifactId:string,digest:string)=>void) {}
  saveDraft(value:DraftInput):ArtifactVersion {
    canonicalDigest(value);const p=record(value,['scope','artifactId','versionId','content','expectedBaseRevision']);
    const scope=parseScope(p.scope);this.authorize(structuredClone(scope));const artifactId=nonEmptyString(p.artifactId);const versionId=nonEmptyString(p.versionId);const baseRevision=nonNegativeInteger(p.expectedBaseRevision);
    requireCondition(typeof p.content==='string','INVALID_SCHEMA','Draft content must be UTF8 text');
    const id=key(scope,artifactId);const head=this.heads.get(id);const currentRevision=head?.revision??0;
    const variantIdentity=key(scope,versionId);const owner=this.versionBindings.get(variantIdentity);requireCondition(owner===undefined||owner===id,'IDEMPOTENCY_CONFLICT','Variant identity cannot move to another artifact');
    requireCondition(baseRevision<=currentRevision,'STALE_REVISION','Draft cannot reference an unknown future revision');
    const draft:ArtifactVersion={scope,artifactId,versionId,baseRevision,revision:baseRevision,digest:createHash('sha256').update(p.content,'utf8').digest('hex'),content:p.content,status:'draft',conflict:baseRevision!==currentRevision,committedArtifactId:null};
    const vid=versionKey(scope,artifactId,versionId);const existing=this.versions.get(vid);
    requireCondition(existing===undefined||sameDraft(existing,draft),'IDEMPOTENCY_CONFLICT','Version identity and content are immutable');
    if(existing!==undefined)return structuredClone(existing);
    if(head===undefined)this.heads.set(id,{scope:structuredClone(scope),artifactId,revision:0,acceptedVersionId:null});
    this.versions.set(vid,structuredClone(draft));this.versionBindings.set(variantIdentity,id);return structuredClone(draft);
  }
  candidate(scope:ScopeRef,artifactId:string,versionId:string,committedArtifactId:string):ArtifactVersion {
    const version=this.current(scope,artifactId,versionId);const manifestId=nonEmptyString(committedArtifactId);
    this.assertCommitted(structuredClone(version.scope),manifestId,version.digest);
    if(version.status!=='draft'){requireCondition(version.committedArtifactId===manifestId,'IDEMPOTENCY_CONFLICT','Candidate manifest binding is immutable');return structuredClone(version);}
    version.status='candidate';version.committedArtifactId=manifestId;return structuredClone(version);
  }
  accept(scope:ScopeRef,artifactId:string,versionId:string,expectedRevision:number,expectedDigest:string):ArtifactVersion {
    const version=this.current(scope,artifactId,versionId);const head=this.head(scope,artifactId);nonNegativeInteger(expectedRevision);nonEmptyString(expectedDigest);
    requireCondition(head.revision===expectedRevision,'STALE_REVISION','A newer accepted version requires compare or a new rebased variant');
    requireCondition(version.digest===expectedDigest,'CHECK_BINDING_MISMATCH','Acceptance binds the exact candidate digest');
    if(version.status==='accepted'){requireCondition(head.acceptedVersionId===versionId,'STALE_REVISION','Historical acceptance cannot overwrite the current head');return structuredClone(version);}
    requireCondition(version.status==='candidate'&&version.committedArtifactId!==null,'ARTIFACT_NOT_COMMITTED','Only durably committed candidates can be accepted');
    requireCondition(!version.conflict&&version.baseRevision===head.revision,'STALE_REVISION','A stale variant needs explicit compare and a new revision-bound candidate');
    this.assertCommitted(structuredClone(version.scope),version.committedArtifactId,version.digest);
    const revision=nonNegativeInteger(head.revision+1);version.status='accepted';version.revision=revision;head.revision=revision;head.acceptedVersionId=versionId;return structuredClone(version);
  }
  get(scope:ScopeRef,artifactId:string,versionId:string):ArtifactVersion {return structuredClone(this.current(scope,artifactId,versionId));}
  getAccepted(scope:ScopeRef,artifactId:string):ArtifactVersion {
    const head=this.head(scope,artifactId);requireCondition(head.acceptedVersionId!==null,'ARTIFACT_NOT_COMMITTED','No accepted artifact version');return this.get(scope,artifactId,head.acceptedVersionId);
  }
  currentRevision(scope:ScopeRef,artifactId:string):number {return this.head(scope,artifactId).revision;}
  list(scope:ScopeRef,artifactId:string):ArtifactVersion[] {
    const head=this.head(scope,artifactId);return [...this.versions.values()].filter(v=>key(v.scope,v.artifactId)===key(head.scope,head.artifactId)).map(v=>structuredClone(v));
  }
  private current(scope:ScopeRef,artifactId:string,versionId:string):ArtifactVersion {
    const s=parseScope(scope);this.authorize(structuredClone(s));const version=this.versions.get(versionKey(s,artifactId,versionId));requireCondition(version!==undefined,'ARTIFACT_NOT_COMMITTED','Current version authority required');return version;
  }
  private head(scope:ScopeRef,artifactId:string):ArtifactHead {
    const s=parseScope(scope);this.authorize(structuredClone(s));const head=this.heads.get(key(s,artifactId));requireCondition(head!==undefined,'ARTIFACT_NOT_COMMITTED','No acknowledged artifact head');return head;
  }
}
