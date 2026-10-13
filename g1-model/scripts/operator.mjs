import { check } from './runner.mjs';
// Fixed local journey driver. No user-supplied credential, URL, command or spend.
if(process.argv.length!==3||process.argv[2]!=='local-journeys')throw new Error('Usage: node g1-model/scripts/operator.mjs local-journeys');
await check('slice',['operator-journeys']);
