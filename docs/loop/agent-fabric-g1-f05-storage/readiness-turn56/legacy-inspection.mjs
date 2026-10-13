// Read-only resource availability; deliberately performs no recovery.
import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { assertContainerOwned, assertRootOwned } from '../../../../g1-storage/scripts/fixture.mjs';
const id='4f6965b47a430aeea46ac69ca234a1b398f099229115973aa0948152c952dfd4',owner='bf1d7748-6b01-449e-8cfe-9802ff82c863',instance='828e0cf3-7b03-4c2d-82f2-d23dcc801a8c';
const r=spawnSync('docker',['inspect',id],{encoding:'utf8',timeout:5000});if(r.error||r.status!==0)throw new Error('Exact legacy container inspect failed');
const info=JSON.parse(r.stdout)[0];assertContainerOwned(info,owner,instance,'agent-fabric-storage-'+instance,id);
console.log(JSON.stringify({measurement:'legacy-container-read-only',id:info.Id,owner,instance,image:info.Config.Image,running:info.State.Running,loopback:true,noBindMount:true,removalPerformed:false}));
const root='/private/tmp/agent-fabric-storage-e6o6Yo',expected={owner,instance,rootId:'a3c722b1-c83c-4638-ae77-c7680aa37dd0',device:16777238,inode:336628387};
if(lstatSync(root,{throwIfNoEntry:false})){assertRootOwned(root,expected);console.log(JSON.stringify({measurement:'legacy-root-read-only',path:root,...expected,present:true,identityMatches:true,removalPerformed:false}));}else console.log(JSON.stringify({measurement:'legacy-root-read-only',path:root,present:false,removalPerformed:false}));
const args=['-axo','pid=,ppid=,pgid=,lstart=,command='];const p=spawnSync('/bin/ps',args,{encoding:'utf8',timeout:3000,env:{PATH:process.env.PATH,LC_ALL:'C'},maxBuffer:4*1024*1024});
console.log(JSON.stringify({measurement:'exact-owned-process-census-probe',command:['/bin/ps',...args],status:p.status,errorCode:p.error?.code,errorMessage:p.error?.message,signal:p.signal,bytes:p.stdout?.length??0,processRecoveryQualified:false,controllerRequired:true}));
