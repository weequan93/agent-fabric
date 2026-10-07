import {runSuites} from './run-suites.mjs';
import {suites} from './suites.mjs';
if (process.argv.length !== 2) throw new Error('Full acceptance gate is unfiltered and takes no arguments');
runSuites(Object.keys(suites), true);
console.log('G1-F03 local recovery gate passed; external qualification remains separately required.');
