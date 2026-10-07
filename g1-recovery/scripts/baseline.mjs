import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export function verifyFiles(base, files) {
  for (const [path, expected] of Object.entries(files)) {
    if (createHash('sha256').update(readFileSync(resolve(base, path))).digest('hex') !== expected)
      throw new Error('Preexisting dependency changed: ' + path);
  }
}
export function assertBaseline() {
  const snapshot = JSON.parse(readFileSync(new URL('../evidence/dependency-baseline.json', import.meta.url), 'utf8'));
  if (snapshot.schemaVersion !== 1 || Object.keys(snapshot.files).length < 600) throw new Error('Incomplete dependency baseline');
  verifyFiles(root, snapshot.files);
  console.log('F03 entry dependency hashes: ' + Object.keys(snapshot.files).length + ' unchanged');
}
