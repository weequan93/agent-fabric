import {runSuites} from './run-suites.mjs';
// Development only. A slice is never full increment qualification.
const args = process.argv.slice(2);
// Controller task definition names the PostgreSQL integration slice.
runSuites(args.length === 1 && args[0] === 'postgres' ? ['durable-authority'] : args.length === 1 && args[0] === 'temporal' ? ['temporal-worker'] : args.length === 1 && args[0] === 'effects' ? ['unknown-effects'] : args.length === 1 && args[0] === 'fences' ? ['stop-fences'] : args.length === 1 && args[0] === 'dispatch' ? ['dispatch-schedules'] : args.length === 1 && args[0] === 'results' ? ['results-notifications'] : args);
