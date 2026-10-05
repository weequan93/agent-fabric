import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
function run(command,args){const r=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.error||r.status!==0)throw Error('Web check failed: '+(r.error?.message??r.status));return r.stdout;}
run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json']);
run(process.execPath,['node_modules/vite/bin/vite.js','build']);
run(process.execPath,['node_modules/vite/bin/vite.js','build','--ssr','src/main.tsx','--outDir','node_modules/.cache/ssr']);
const tap=run(process.execPath,['--test','--test-reporter=tap','tests/client-state.test.mjs']);
if(!/^# tests [1-9]\d*$/m.test(tap)||/^not ok /m.test(tap)||/^# (?:skipped|todo) [1-9]/m.test(tap)||/^(?:ok|not ok).*# (?:SKIP|TODO)/mi.test(tap))throw Error('Nonempty executed Web state checks required');
const html=readFileSync(resolve(root,'node_modules/.cache/web-dist/index.html'),'utf8');if(!html.includes('assets/'))throw Error('Missing real browser bundle');
console.log('Web: strict typecheck, production browser/SSR build and actual state/SDK checks passed. UI interaction is a separate required check.');
