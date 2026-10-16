import {cpSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
export const source=process.env['RUNTIME_SOURCE_ROOT']!;
if(!source)throw new Error('Actual runner source root required');
export const api=async(name:string):Promise<any>=>import(pathToFileURL(join(source,'scripts',name+'.mjs')).href);
export async function capsule(){
 const {ownedDirectory}=await api('build');const own=ownedDirectory('runtime-harness-');
 const dir=join(own.path,'g1-runtime');mkdirSync(dir);
 for(const p of ['scripts','verification','migrations'])cpSync(join(source,p),join(dir,p),{recursive:true});
 return {...own,dir};
}
export function negativeEvidence(name:string):string {
 const path=join(dirname(process.env['RUNTIME_OBSERVATIONS']!), 'negative-fixtures',name+'-'+randomUUID());mkdirSync(path,{recursive:true});return path;
}
export function fixtureFile(path:string,text:string):void {mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);}
export function json(path:string):any{return JSON.parse(readFileSync(path,'utf8'));}
