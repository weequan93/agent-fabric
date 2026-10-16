/** Finite owned workers. Descriptors are data, never execution authority. */
import {object,version,text,uuid,revision,enumeration,refined} from './schemas.js';
import {bindingDigest} from './owners.js';
export const ClosedPath=enumeration('shell','sdk','mcp','filesystem');
export const ToolArgumentsSchema=object({payload:refined(text,v=>Buffer.byteLength(v)<=2048),outputBytes:refined(revision,v=>v<=65_537),durationMs:refined(revision,v=>v<=6000),probe:enumeration('none','protected','external','control','secret','socket','db','child')});
export const ToolRequestSchema=object({schemaVersion:version,operationId:uuid,key:uuid,taskId:uuid,toolId:text,toolVersion:text,path:ClosedPath,effect:enumeration('target-write'),targetId:uuid,args:ToolArgumentsSchema,timeoutMs:refined(revision,v=>v>0&&v<=5000),outputMaxBytes:refined(revision,v=>v>0&&v<=65_536)});
export type ToolRequest=ReturnType<typeof ToolRequestSchema.parse>;
const DescriptorSchema=object({schemaVersion:version,toolId:text,toolVersion:text,path:ClosedPath,effect:enumeration('target-write'),resource:enumeration('owned-target'),grant:enumeration('target:write'),argumentsSchema:enumeration('owned-target-arguments-v1'),timeoutMs:refined(revision,v=>v===5000),outputMaxBytes:refined(revision,v=>v===65_536),idempotency:enumeration('original-operation-id'),reconciliation:enumeration('trusted-original-target-lookup'),implementation:enumeration('fixed-owned-worker-v1')});
export type ToolDescriptor=ReturnType<typeof DescriptorSchema.parse>;
const paths=['shell','sdk','mcp','filesystem'] as const;
export const toolDescriptors=Object.freeze(paths.map(path=>Object.freeze(DescriptorSchema.parse({schemaVersion:1,toolId:'owned-'+path,toolVersion:'1.0.0',path,effect:'target-write',resource:'owned-target',grant:'target:write',argumentsSchema:'owned-target-arguments-v1',timeoutMs:5000,outputMaxBytes:65_536,idempotency:'original-operation-id',reconciliation:'trusted-original-target-lookup',implementation:'fixed-owned-worker-v1'}))));
export function validateDescriptor(raw:unknown):ToolDescriptor{
 const value=DescriptorSchema.parse(raw),installed=toolDescriptors.find(d=>d.toolId===value.toolId);
 if(!installed||bindingDigest(installed)!==bindingDigest(value))throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');return installed;
}
export function resolveTool(raw:unknown):{request:ToolRequest;descriptor:ToolDescriptor}{
 const request=ToolRequestSchema.parse(raw),descriptor=toolDescriptors.find(d=>d.toolId===request.toolId);
 if(!descriptor||descriptor.toolVersion!==request.toolVersion||descriptor.path!==request.path||descriptor.effect!==request.effect||request.timeoutMs>descriptor.timeoutMs||request.outputMaxBytes>descriptor.outputMaxBytes)throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');
 return {request,descriptor};
}
