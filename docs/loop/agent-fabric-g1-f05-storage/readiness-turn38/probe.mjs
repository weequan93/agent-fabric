// Disposable resource probe, not a product test or an acceptance entry point.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { mkdtemp, mkdir, open, rename, readFile, writeFile, lstat, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';

const owner = randomUUID(), root = await mkdtemp('/private/tmp/agent-fabric-readiness38-');
const identity = await lstat(root);
const children = new Set();
let server;
try {
  await writeFile(join(root, '.owner'), owner, { flag: 'wx', mode: 0o600 });
  const key = randomBytes(32), nonce = randomBytes(12), aad = Buffer.from('resource-probe/v1');
  const plain = Buffer.concat([Buffer.from('问/readiness38'), Buffer.from([0, 255]), randomBytes(32)]);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]), tag = cipher.getAuthTag();
  function decrypt(k, a, b, t) {
    const d = createDecipheriv('aes-256-gcm', k, nonce); d.setAAD(a); d.setAuthTag(t);
    return Buffer.concat([d.update(b), d.final()]);
  }
  assert.deepEqual(decrypt(key, aad, body, tag), plain);
  const badBody = Buffer.from(body); badBody[0] ^= 1;
  const badTag = Buffer.from(tag); badTag[0] ^= 1;
  for (const args of [[randomBytes(32), aad, body, tag], [key, Buffer.from('wrong'), body, tag], [key, aad, badBody, tag], [key, aad, body, badTag]]) {
    assert.throws(() => decrypt(...args));
  }
  assert.notEqual(createHmac('sha256', key).update(plain).digest('hex'), createHmac('sha256', randomBytes(32)).update(plain).digest('hex'));
  for (const kind of ['content', 'backup', 'restore']) await mkdir(join(root, kind), { mode: 0o700 });
  const serialized = Buffer.concat([nonce, tag, body]);
  for (const kind of ['content', 'backup', 'restore']) {
    const directory = join(root, kind), temporary = join(directory, 'staged'), target = join(directory, 'cipher');
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(serialized); await file.sync(); } finally { await file.close(); }
    await rename(temporary, target);
    const dirHandle = await open(directory, 'r');
    try { await dirHandle.sync(); } finally { await dirHandle.close(); }
    assert.deepEqual(await readFile(target), serialized);
    assert.equal((await lstat(target)).mode & 0o777, 0o600);
    assert.equal(serialized.includes(plain), false);
  }
  console.log(JSON.stringify({ measurement: 'crypto-files', exactBinaryRoundtrip: true, integrityRefusals: 4, scopedHmacSeparation: true, exclusiveWrite: true, fileSync: true, rename: true, directorySync: true, distinctRoots: 3, mode: '0600', productRestoreQualified: false }));
  server = createServer((req, res) => res.end('readiness38'));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const response = await fetch('http://127.0.0.1:' + server.address().port, { signal: AbortSignal.timeout(2000) });
  assert.equal(await response.text(), 'readiness38');
  await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); server = undefined;
  console.log(JSON.stringify({ measurement: 'loopback-http', request: true, exactResponse: true, closed: true }));
  const childPath = join(root, 'child.mjs');
  await writeFile(childPath, "process.send({marker:process.env.READINESS38_MARKER,pid:process.pid});setInterval(()=>{},1000);", { flag: 'wx', mode: 0o600 });
  for (const signal of ['SIGKILL', 'SIGTERM']) {
    const marker = randomUUID(), child = fork(childPath, [], { env: { READINESS38_MARKER: marker }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    children.add(child);
    const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
    try {
      const [message] = await once(child, 'message'); assert.deepEqual(message, { marker, pid: child.pid });
      const exited = once(child, 'exit'); assert.equal(child.kill(signal), true);
      const [code, actualSignal] = await exited; assert.equal(code, null); assert.equal(actualSignal, signal);
      children.delete(child);
      console.log(JSON.stringify({ measurement: 'owned-child', pid: child.pid, instanceVerified: true, signal: actualSignal, reaped: true }));
    } finally { clearTimeout(deadline); }
  }
  const args = ['-axo', 'pid=,ppid=,pgid=,lstart=,comm='];
  const census = spawnSync('ps', args, { encoding: 'utf8', timeout: 5000 });
  console.log(JSON.stringify({ measurement: 'sandbox-census', command: ['ps', ...args], status: census.status, signal: census.signal, errorCode: census.error?.code, errorMessage: census.error?.message, rows: census.stdout?.trim().split('\n').length ?? 0, controllerRequired: !!census.error }));
  console.log(JSON.stringify({ measurement: 'host', system: os.type(), release: os.release(), arch: os.arch(), cpus: os.cpus().length, parallelism: os.availableParallelism(), totalMemory: os.totalmem(), freeMemory: os.freemem() }));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
  }
  const now = await lstat(root);
  assert.equal(now.isSymbolicLink(), false); assert.equal(now.dev, identity.dev); assert.equal(now.ino, identity.ino);
  assert.equal(await realpath(root), root); assert.equal(await readFile(join(root, '.owner'), 'utf8'), owner);
  await rm(root, { recursive: true }); assert.equal(await lstat(root).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e)), null);
  console.log(JSON.stringify({ measurement: 'probe-cleanup', root, owner, removed: true, onlyNewOwnedResources: true }));
}
