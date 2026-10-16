// Supplemental design observation, never a replacement for bootstrap's actual
// independently acknowledged OS birth/ancestry or the owning test's oracles.
import assert from 'node:assert/strict';
import {appendFileSync,readFileSync,statSync} from 'node:fs';
import {dirname,join} from 'node:path';
if(process.env.RUNTIME_BIRTH_LOG&&process.argv[1]?.endsWith('/settlement-target.js')){
 const root=process.argv[2],owner=JSON.parse(readFileSync(join(dirname(root),'.runtime-owner.json'),'utf8'));
 assert.equal(owner.path,dirname(root));assert.ok(owner.nonce);
 const s=statSync(root);assert.ok(s.isDirectory());
 appendFileSync(process.env.RUNTIME_BIRTH_LOG+'.design-targets',JSON.stringify({nonce:process.env.RUNTIME_OWNER_NONCE,pid:process.pid,ppid:process.ppid,root,dev:s.dev,ino:s.ino})+'\n');
}
