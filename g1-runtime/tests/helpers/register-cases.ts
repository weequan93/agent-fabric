import assert from 'node:assert/strict';
import {test} from 'node:test';
import {appendFileSync} from 'node:fs';
export type Observations=Record<string,Record<string,unknown>>;
export function registerCases(cases:Record<string,()=>void|Observations|Promise<void|Observations>>,required:readonly string[]):void {
 const selected:unknown=JSON.parse(process.env['RUNTIME_CASES']??JSON.stringify(Object.keys(cases)));
 assert.ok(Array.isArray(selected)&&selected.length>0&&selected.every(id=>typeof id==='string'&&Object.hasOwn(cases,id))&&new Set(selected).size===selected.length,'Closed registered assertion inventory');
 for(const id of selected as string[])test(id,async()=>{
  const detail=await cases[id]!();
  const file=process.env['RUNTIME_OBSERVATIONS'];
  if(file){
   assert.ok(detail&&required.every(k=>Object.hasOwn(detail,k)),'Actual observation details required');
   appendFileSync(file,JSON.stringify({id,pid:process.pid,nonce:process.env['RUNTIME_OWNER_NONCE'],candidate:process.env['RUNTIME_CANDIDATE'],success:true,observations:required.map(kind=>({kind,observed:true,forbidden:false,detail:detail![kind]}))})+'\n');
  }
 });
}
