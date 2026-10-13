import { validateArtifacts, actualControllerBehavior } from './qualification-artifacts.mjs';
if(process.argv.length!==3 || !['local','controller-behavior'].includes(process.argv[2])) throw new Error('Closed evidence phase required');
const result=process.argv[2]==='local'?validateArtifacts():actualControllerBehavior();
console.log(JSON.stringify({measurement:'qualification-artifacts',phase:process.argv[2],...result}));
