import {readFileSync} from 'node:fs';
import {sha} from './build.mjs';
const bytes=readFileSync(new URL('../verification/case-inventory.json',import.meta.url));
if(sha(bytes)!=='47e12c9af887db0dfd7da75b89a8b1d3d66a9e0a8d364a376786fe04a817cd22')throw new Error('Mandatory design inventory changed');
const data=JSON.parse(bytes);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const inventory=freeze(data);
export const ids=inventory.ids;
export const localSuites=inventory.localSuites;
export const info=id=>inventory.families[id.split('/')[0]];
export function descendants(prefix,allowed=ids){return allowed.filter(id=>id===prefix||id.startsWith(prefix+'/'));}
export function exactInventory(actual,expected,label='inventory'){
 if(!Array.isArray(actual)||!actual.length||new Set(actual).size!==actual.length||actual.some(x=>typeof x!=='string')||actual.length!==expected.length||expected.some(id=>!actual.includes(id)))throw new Error('Missing/empty/duplicate/unexpected '+label);
 return true;
}
export function view(kind,names=[]){
 let permitted;
 if(kind==='full'){if(names.length)throw new Error('Full check accepts no partial option');permitted=ids.filter(id=>info(id).domain==='L');}
 else if(kind==='suites'){
  if(!names.length||new Set(names).size!==names.length||names.some(n=>!localSuites.includes(n)))throw new Error('Unknown/duplicate/empty suite');
  permitted=ids.filter(id=>names.includes(info(id).suite));
 }else if(kind==='component'){
  if(names.length!==1||!Object.hasOwn(inventory.componentViews,names[0]))throw new Error('Unknown component');
  permitted=ids.filter(id=>inventory.componentViews[names[0]].some(p=>id===p||id.startsWith(p+'/')));
 }else if(kind==='owners'||kind==='remote'){
  if(names.length)throw new Error('Unexpected runner name');permitted=ids.filter(id=>info(id).domain===(kind==='owners'?'P':'X'));
 }else throw new Error('Unknown runner view');
 return Object.freeze(permitted);
}
export function select(kind,args){
 if(kind==='full'){if(args.length)throw new Error('Full check accepts no arguments');return Object.freeze({kind,names:[],selectors:null,permitted:view(kind),expanded:view(kind),partial:false});}
 const at=args.indexOf('--cases');
 const names=at<0?args:args.slice(0,at),selectors=at<0?null:args.slice(at+1);
 if(selectors!==null&&(!selectors.length||new Set(selectors).size!==selectors.length||selectors.some(s=>s.startsWith('-'))))throw new Error('Empty/duplicate/invalid selector');
 const permitted=view(kind,names);let expanded=permitted;
 if(selectors){
  const chosen=new Set();
  for(const s of selectors){const all=descendants(s);if(!all.length||all.some(id=>!permitted.includes(id)))throw new Error('Unknown or wrong-view selector: '+s);for(const id of all){if(chosen.has(id))throw new Error('Overlapping selector: '+s);chosen.add(id);}}
  expanded=permitted.filter(id=>chosen.has(id));
 }
 return freeze({kind,names,selectors,permitted,expanded,partial:selectors!==null});
}
export function assertSuiteInventory(suites){return exactInventory(suites,localSuites,'full local suites');}
