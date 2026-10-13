import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { cwd } from './paths.mjs';
export function candidateSnapshot(){
 const files=[];
 const walk=directory=>{
  for(const name of readdirSync(directory).sort()){
   if(name==='node_modules')continue;
   const file=resolve(directory,name),s=lstatSync(file);
   if(s.isSymbolicLink())throw new Error('Candidate symlink refused');
   if(s.isDirectory())walk(file);else if(s.isFile())files.push([relative(cwd,file),createHash('sha256').update(readFileSync(file)).digest('hex')]);
  }
 };walk(cwd);
 return {digest:'sha256:'+createHash('sha256').update(JSON.stringify(files)).digest('hex'),files:files.length};
}
