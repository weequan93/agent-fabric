import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const r=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/typescript/bin/tsc',import.meta.url)),'-p','tsconfig.json'],{cwd,stdio:'inherit',timeout:60000});
if(r.error||r.status!==0)process.exit(1);
