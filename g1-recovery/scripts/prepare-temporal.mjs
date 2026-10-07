// Explicit free dependency setup, never invoked by an acceptance check.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('This pinned fixture qualifies Darwin arm64 only');
const cwd=fileURLToPath(new URL('../node_modules/.cache/temporal-cli/',import.meta.url));
await mkdir(cwd,{recursive:true});
const archive=new URL('../node_modules/.cache/temporal-cli/archive.tar.gz',import.meta.url);
const expected='cccbead89534e365a3527d40f6d3370a8fa16af6d7853c9864422fb1f7053fe4';
let bytes;try{bytes=await readFile(archive);}catch{
 const response=await fetch('https://github.com/temporalio/cli/releases/download/v1.4.1/temporal_cli_1.4.1_darwin_arm64.tar.gz');
 if(!response.ok)throw new Error('Pinned CLI download failed');bytes=Buffer.from(await response.arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Pinned archive digest mismatch');
 await writeFile(archive,bytes,{flag:'wx'});
}
if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Pinned archive digest mismatch');
const r=spawnSync('tar',['-xzf',fileURLToPath(archive),'-C',cwd],{stdio:'inherit',timeout:15000});if(r.error||r.status!==0)throw r.error??new Error('Extract failed');
const binary=await readFile(new URL('../node_modules/.cache/temporal-cli/temporal',import.meta.url));
if(createHash('sha256').update(binary).digest('hex')!=='a1ae1b420699c1351521f296bf59cd195d25239e89a08c60bc69a6edd01069cc')throw new Error('Pinned executable digest mismatch');
console.log('Cached CLI1.4.1 Server1.28.0; archive and binary SHA256 verified');
