import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
import { suites,components,controllerCases,externalCases } from './manifest.mjs';
import {atomicDisconnectSuite,assertAtomicDisconnectRegistry} from './atomic-disconnect.mjs';
import {verifyAskRecallComponent} from './verify-ask-recall.mjs';
import {verifyAskDisclosureComponent} from './verify-ask-disclosure.mjs';
import {verifyAskRoutingComponent} from './verify-ask-routing.mjs';
import {verifyRestoreCurrentComponent} from './verify-restore-current.mjs';
import {verifyRestoreInterruptionComponent} from './verify-restore-interruption.mjs';
import {verifyRestoreIntegrityComponent} from './verify-restore-integrity.mjs';
import {verifyRestoreMeasurementComponent} from './verify-restore-measurement.mjs';
import {verifyEncryptionComponent} from './verify-encryption.mjs';
import {verifyRetainedCopiesComponent} from './verify-retained-copies.mjs';
import {deliveryOperationsComponent} from './delivery-operations.mjs';
import {deliveryEvidenceComponent} from './delivery-evidence.mjs';
export const executionSuites=Object.freeze(Object.fromEntries(Object.entries(suites).flatMap(([id,suite])=>id==='commit-conflict'?[[id,suite],['atomic-disconnect',atomicDisconnectSuite]]:[[id,suite]])));
export const executionComponents=Object.freeze({...components,'delivery-operations':deliveryOperationsComponent,'delivery-evidence':deliveryEvidenceComponent,'verify-atomic-disconnect':atomicDisconnectSuite,
 'verify-restore-measurement':verifyRestoreMeasurementComponent,'verify-restore-integrity':verifyRestoreIntegrityComponent,'verify-encryption':verifyEncryptionComponent,'verify-retained-copies':verifyRetainedCopiesComponent,
 'verify-ask-routing':verifyAskRoutingComponent,'verify-restore-current':verifyRestoreCurrentComponent,'verify-restore-interruption':verifyRestoreInterruptionComponent,
 'verify-ask-recall':verifyAskRecallComponent,'verify-ask-disclosure':verifyAskDisclosureComponent});
// These are the registrations already executed by the complete S-K file.
// Keep execution expectations here, alongside the mandatory registry gate.
export const commitConflictPredecessors=['atomic-save','knowledge-status','knowledge-correction','command-recovery','artifact-publication'];
export const commitConflictObservationSources=[...commitConflictPredecessors.map(component=>({component})),
 {component:'verify-atomic',suite:'commit-conflict'},
 {component:'verify-knowledge',suite:'commit-conflict'},
 {component:'verify-artifact',suite:'commit-conflict',measurement:'artifact-verification-observations'}];
export const recallAskPredecessors=['recall-broker','native-ask','ask-disclosure'];
export const recallAskObservationSources=[...recallAskPredecessors.map(component=>({component})),
 ...['verify-ask-recall','verify-ask-disclosure','verify-ask-routing'].map(component=>({component,suite:'recall-ask'}))];
export const backupRestorePredecessors=['backup-capture','backup','restore-import','restore-activation','restore-progress'];
export const backupRestoreObservationSources=[...backupRestorePredecessors.map(component=>({component})),
 ...['verify-restore-current','verify-restore-interruption','verify-restore-integrity','verify-restore-measurement'].map(component=>({component,suite:'backup-restore'}))];
export function assertManifest(){
 const design=JSON.parse(readFileSync(resolve(cwd,'verification/test-design-v1.json'),'utf8'));
 const requiredBytes=readFileSync(resolve(cwd,'verification/required-variants-v1.json'));
 if(createHash('sha256').update(requiredBytes).digest('hex')!=='31e8e23b8f3c96a244378d94c0676b054365d3a2c0dc204989ba8a037a11dd30')throw new Error('Frozen v1 variant inventory changed');
 const required=JSON.parse(requiredBytes);
 if(required.schemaVersion!==1||Object.keys(required.cases).length!==64||Object.values(required.cases).reduce((n,v)=>n+v.length,0)!==420)throw new Error('Frozen v1 variant inventory incomplete');
 const local=Object.keys(design.cases).filter(id=>!id.startsWith('G')).sort();
 const executed=Object.values(suites).flatMap(s=>s.cases).sort();
 if(design.schemaVersion!==1||local.length!==64||Object.keys(design.cases).length!==67
  ||JSON.stringify(local)!==JSON.stringify(executed)||new Set(executed).size!==64
  ||Object.keys(design.requirements).length!==96)throw new Error('Frozen local requirement/case registry differs');
 if(JSON.stringify(Object.keys(controllerCases).sort())!==JSON.stringify(Object.keys(design.cases).filter(id=>id.startsWith('G')).sort())
  ||JSON.stringify(Object.keys(externalCases))!==JSON.stringify(Object.keys(design.external)))throw new Error('Regression/external registry differs');
 for(const suite of Object.values(suites)){
  if(suite.integration?(!suite.positives?.length):suite.positives!==null)throw new Error('Mandatory useful-positive registry missing');
  if(!/^[a-z-]+\.test\.js$/.test(suite.file)||Object.keys(suite.variants).length!==suite.cases.length)throw new Error('Closed suite/variant map missing');
  for(const id of suite.cases){
   const names=suite.variants[id];
   if(!required.cases[id]||required.cases[id].some(n=>!names?.includes(n))||!names?.length||new Set(names).size!==names.length||names.some(n=>!n.startsWith(id+'/')))throw new Error('Nonempty unique mandatory variant identities required');
  }
 }
 for(const s of Object.values(components))if(!s.cases.length||(s.integration?!s.positives?.length:s.positives!==null))throw new Error('Empty component/positive registry');
 const delivery=executionComponents['delivery-operations'];
 if(JSON.stringify(delivery.cases)!==JSON.stringify(['D01','D03','D04','D05'])||!delivery.integration
  ||JSON.stringify(delivery.positives)!==JSON.stringify(suites['delivery-audit'].positives)
  ||Object.values(delivery.variants).flat().length!==24)throw new Error('Fixed delivery operations registration incomplete');
 for(const id of delivery.cases)if(JSON.stringify(delivery.variants[id])!==JSON.stringify(required.cases[id]))throw new Error('Every frozen delivery variant required: '+id);
 const evidence=executionComponents['delivery-evidence'];
 if(JSON.stringify(evidence.cases)!==JSON.stringify(['D02','D06'])||evidence.integration||evidence.positives!==null
  ||Object.values(evidence.variants).flat().length!==7)throw new Error('Fixed delivery evidence registration incomplete');
 for(const id of evidence.cases)if(JSON.stringify(evidence.variants[id])!==JSON.stringify(required.cases[id]))throw new Error('Every frozen evidence variant required: '+id);
 for(const [id,cases,count] of [['verify-ask-recall',['Q01','Q02','Q03','Q09'],18],['verify-ask-disclosure',['Q04','Q07'],13],['verify-ask-routing',['Q05','Q06','Q08'],26],['verify-restore-current',['R01','R02','R03'],23],['verify-restore-interruption',['R04'],12],['verify-restore-integrity',['R05','R06'],28],['verify-restore-measurement',['R07','R08','R09'],18],['verify-encryption',['E01','E02'],19],['verify-retained-copies',['E03','E04'],9]]){
  const component=executionComponents[id];
  if(JSON.stringify(component.cases)!==JSON.stringify(cases)||!component.integration||!component.positives.length
   ||Object.values(component.variants).flat().length!==count||Object.keys(component.variants).length!==cases.length)throw new Error('Fixed component registration incomplete: '+id);
  for(const c of cases)if(JSON.stringify(component.variants[c])!==JSON.stringify(required.cases[c]))throw new Error('Every frozen variant required: '+c);
 }
 // The complete S-K file also executes these five original component groups.
 const predecessors=commitConflictPredecessors.map(name=>components[name]);
 if(predecessors.some(s=>!s)||predecessors.flatMap(s=>s.cases).length!==5
  ||commitConflictObservationSources.length!==8)throw new Error('Exact original S-K predecessor/source count required');
 const restorePredecessors=backupRestorePredecessors.map(name=>components[name]);
 if(restorePredecessors.some(s=>!s)||restorePredecessors.flatMap(s=>s.cases).length!==5
  ||restorePredecessors.flatMap(s=>Object.values(s.variants).flat()).length!==178
  ||backupRestoreObservationSources.length!==9)throw new Error('Exact original S-R predecessor/source count required');
 if(Object.values(suites).some(s=>s.predecessors||s.observationSources))throw new Error('Unknown supplemental suite expectations');
 const known=new Set([...local,...Object.keys(controllerCases),...Object.keys(externalCases)]);
 for(const references of Object.values(design.requirements))if(!references.length||references.some(id=>!known.has(id)))throw new Error('Requirement case mapping incomplete');
 return {...assertAtomicDisconnectRegistry(executionSuites,executionComponents),localCases:64,controllerCases:3,externalGates:9,requirements:96,
  requiredVariants:Object.values(suites).reduce((n,s)=>n+Object.values(s.variants).reduce((m,v)=>m+v.length,0),0)};
}
