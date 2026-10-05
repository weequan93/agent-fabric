import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLocalRuntime } from './session-service.js';
import { startLocalHttp, DEFAULT_LOCAL_ORIGINS } from './http.js';
import { LocalError, toLocalError } from './errors.js';

export async function runLocalCli(args: readonly string[] = process.argv.slice(2)) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const localRoot = scriptDirectory.includes(`${sep}node_modules${sep}.cache${sep}g1-build${sep}`)
    ? resolve(scriptDirectory, '../../../../..') : resolve(scriptDirectory, '..');
  let directory = resolve(localRoot, 'node_modules/.cache/g1-local-state');
  let port = 8791;
  for (let index = 0; index < args.length; index++) {
    const name = args[index], value = args[index + 1];
    if (name === '--directory' && value) { directory = resolve(value); index++; }
    else if (name === '--port' && value && /^\d+$/.test(value)) { port = Number(value); index++; }
    else throw new LocalError('LOCAL_POLICY_VIOLATION', 'Only --directory and --port are supported; paid routes and remote execution are disabled.');
  }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new LocalError('INVALID_SCHEMA', 'A local port between 1 and 65535 is required.');
  const runtime = createLocalRuntime({ directory });
  try {
    const http = await startLocalHttp({ service: runtime.service, port, origins: DEFAULT_LOCAL_ORIGINS });
    let closing: Promise<void> | null = null;
    const close = () => closing ??= http.close().finally(() => runtime.close());
    const stop = () => { void close().catch(() => { process.exitCode = 1; }); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log(JSON.stringify({ baseUrl: http.baseUrl, directory, modelMode: 'deterministic-test', effectMode: 'synthetic-only', paidCallsAllowed: false, remoteAllowed: false, identityMode: 'local-test' }));
    return { ...http, runtime, close };
  } catch (error) { runtime.close(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runLocalCli().catch(error => { const safe = toLocalError(error); console.error(safe.code + ': ' + safe.message); process.exitCode = 1; });
}
