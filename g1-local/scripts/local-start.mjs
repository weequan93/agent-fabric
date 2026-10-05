import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const localRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
export function localStartCommands() {
  return [
    { name: 'api', cwd: localRoot, args: [join(localRoot, 'node_modules/.cache/g1-build/g1-local/src/cli.js'), '--port', '8791', '--directory', join(localRoot, 'node_modules/.cache/g1-local-state')] },
    { name: 'web', cwd: join(localRoot, 'web'), args: [join(localRoot, 'web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'] },
  ];
}
export function parseLocalStartArgs(args) {
  if (args.length === 0) return 'start';
  if (args.length === 1 && args[0] === '--help') return 'help';
  throw new Error('Only --help is supported. API/Web ports, loopback hosts and the unpaid local profile are fixed.');
}
export function startLocalStack() {
  const commands = localStartCommands();
  for (const command of commands) if (!existsSync(command.args[0])) throw new Error(`Missing ${command.name} build/dependency. Follow docs/operations/g1-local-quickstart.md first.`);
  const children = [];
  const exits = [];
  let stopping = false;
  let closePromise = null;
  let timer = null;
  const close = () => {
    if (closePromise) return closePromise;
    stopping = true;
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
    timer = setTimeout(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); }, 5000);
    closePromise = Promise.all(exits).then(() => { clearTimeout(timer); process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal); });
    return closePromise;
  };
  const onSignal = () => { void close(); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  for (const command of commands) {
    const child = spawn(process.execPath, command.args, { cwd: command.cwd, stdio: 'inherit', shell: false });
    children.push(child);
    exits.push(new Promise(resolveExit => child.once('close', () => resolveExit())));
    child.once('error', error => { console.error(`${command.name}: ${error.message}`); process.exitCode = 1; void close(); });
    child.once('exit', (code, signal) => {
      if (!stopping) { console.error(`${command.name} exited (${code ?? signal}); stopping the local stack without restarting or deleting state.`); process.exitCode = code === 0 ? 0 : 1; void close(); }
    });
  }
  console.log(JSON.stringify({ api: 'http://127.0.0.1:8791', web: 'http://127.0.0.1:5173', modelMode: 'deterministic-test', effectMode: 'synthetic-only', paidCallsAllowed: false, remoteAllowed: false, stateDirectory: join(localRoot, 'node_modules/.cache/g1-local-state') }));
  return { children, close };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (parseLocalStartArgs(process.argv.slice(2)) === 'help') console.log('node g1-local/scripts/local-start.mjs — fixed loopback API8791 + Web5173; Ctrl+C stops both and preserves SQLite state.');
    else startLocalStack();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
