import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, type ScopeRef } from './identity.js';
import { parseScope } from './task-envelope.js';

export interface MemoryInput {scope:ScopeRef;memoryId:string;content:string;sourceIds:string[]}
export interface MemoryRevision extends MemoryInput {revision:number;authorityRevision:number;status:'current'|'deleted'}
export interface FactMemoryPorts {authorize:(scope:ScopeRef)=>number;assertSourceCurrent:(scope:ScopeRef,sourceId:string)=>void}
function key(scope:ScopeRef,id:string):string {const s=parseScope(scope);return JSON.stringify([s.tenantId,s.spaceId,nonEmptyString(id)]);}
function parseMemory(value:MemoryInput):MemoryInput {canonicalDigest(value);record(value,['scope','memoryId','content','sourceIds']);requireCondition(typeof value.content==='string'&&Array.isArray(value.sourceIds)&&value.sourceIds.length>0,'INVALID_SCHEMA','Source-backed fact content required');const sources=value.sourceIds.map(id=>nonEmptyString(id));requireCondition(new Set(sources).size===sources.length,'INVALID_SCHEMA','Source identities must be unique');return {scope:parseScope(value.scope),memoryId:nonEmptyString(value.memoryId),content:value.content,sourceIds:sources};}
/** Source content remains data. This module has no behavior-release capability. */
export class FactMemoryRepository {
  private readonly revisions=new Map<string,MemoryRevision[]>();private readonly deletedMemories=new Set<string>();private readonly deletedSources=new Set<string>();
  constructor(private readonly ports:FactMemoryPorts) {}
  create(value:MemoryInput):MemoryRevision {
    const input=parseMemory(value);const authorityRevision=this.authorize(input.scope);const id=key(input.scope,input.memoryId);
    requireCondition(!this.deletedMemories.has(id),'UNAUTHORIZED','Deleted fact identity cannot be restored');this.assertSources(input);
    const existing=this.revisions.get(id);requireCondition(existing===undefined,'IDEMPOTENCY_CONFLICT','Memory identity already exists; correction requires CAS');
    const memory:MemoryRevision={...input,revision:0,authorityRevision,status:'current'};this.revisions.set(id,[structuredClone(memory)]);return structuredClone(memory);
  }
  correct(scope:ScopeRef,memoryId:string,content:string,sourceIds:string[],expectedRevision:number):MemoryRevision {
    const input=parseMemory({scope,memoryId,content,sourceIds});const authorityRevision=this.authorize(input.scope);const current=this.current(input.scope,memoryId);nonNegativeInteger(expectedRevision);
    requireCondition(current.revision===expectedRevision,'STALE_REVISION','Fact correction requires current base revision');this.assertSources(input);
    const revision=nonNegativeInteger(current.revision+1);const memory:MemoryRevision={...input,revision,authorityRevision,status:'current'};this.revisions.get(key(input.scope,memoryId))!.push(structuredClone(memory));return structuredClone(memory);
  }
  get(scope:ScopeRef,memoryId:string):MemoryRevision {const current=this.current(scope,memoryId);return {...structuredClone(current),authorityRevision:this.authorize(current.scope)};}
  retrieve(scope:ScopeRef):MemoryRevision[] {const s=parseScope(scope);this.authorize(s);const result:MemoryRevision[]=[];for(const history of this.revisions.values()){const current=history.at(-1)!;if(current.scope.tenantId===s.tenantId&&current.scope.spaceId===s.spaceId&&!this.deletedMemories.has(key(s,current.memoryId)))result.push(this.get(s,current.memoryId));}return result;}
  history(scope:ScopeRef,memoryId:string):MemoryRevision[] {this.current(scope,memoryId);const list=this.revisions.get(key(scope,memoryId))!;for(const item of list)this.assertSources(item);return structuredClone(list);}
  delete(scope:ScopeRef,memoryId:string):void {const s=parseScope(scope);this.authorize(s);this.deletedMemories.add(key(s,memoryId));}
  sourceDelete(scope:ScopeRef,sourceId:string):void {const s=parseScope(scope);this.authorize(s);const id=nonEmptyString(sourceId);this.deletedSources.add(key(s,id));for(const history of this.revisions.values()){const current=history.at(-1)!;if(current.scope.tenantId===s.tenantId&&current.scope.spaceId===s.spaceId&&current.sourceIds.includes(id))this.deletedMemories.add(key(s,current.memoryId));}}
  private current(scope:ScopeRef,memoryId:string):MemoryRevision {const s=parseScope(scope);this.authorize(s);const id=key(s,memoryId);requireCondition(!this.deletedMemories.has(id),'UNAUTHORIZED','Deleted fact is unavailable');const current=this.revisions.get(id)?.at(-1);requireCondition(current!==undefined,'UNAUTHORIZED','Current memory authority required');this.assertSources(current);return current;}
  private authorize(scope:ScopeRef):number {return nonNegativeInteger(this.ports.authorize(structuredClone(parseScope(scope))),'authorityRevision');}
  private assertSources(memory:MemoryInput):void {for(const source of memory.sourceIds){requireCondition(!this.deletedSources.has(key(memory.scope,source)),'UNAUTHORIZED','Deleted source cannot be recalled');this.ports.assertSourceCurrent(structuredClone(memory.scope),source);}}
}
