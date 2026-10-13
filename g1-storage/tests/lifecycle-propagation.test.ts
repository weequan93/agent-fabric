import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {ComponentTest} from './helpers/canonical-component.js';
const {registerFullComponent}=await import(pathToFileURL(resolve(process.env['STORAGE_REPO_ROOT']!,'g1-storage/scripts/full-registration.mjs')).href);
// The complete retention component is mandatory here. Frozen L01–L09 graph,
// maintenance and retry journeys are added by their owning tasks.
import { registerRetentionTests } from './helpers/retention-component.js';
await registerFullComponent('lifecycle-propagation','retention-forget',registerRetentionTests,test);

import { registerDependencyGraphTests } from './helpers/dependency-graph-component.js';
await registerFullComponent('lifecycle-propagation','dependency-graph',registerDependencyGraphTests,test);

import { registerMaintenanceAdmissionTests } from './helpers/maintenance-admission-component.js';
await registerFullComponent('lifecycle-propagation','maintenance-admission',registerMaintenanceAdmissionTests,test);

import { registerPropagationRetryTests } from './helpers/propagation-retry-component.js';
await registerFullComponent('lifecycle-propagation','propagation-retry',registerPropagationRetryTests,test);

import {registerLifecycleVerificationTests} from './helpers/register-lifecycle-verification-tests.js';
await registerFullComponent('lifecycle-propagation','verify-lifecycle',(register:ComponentTest)=>registerLifecycleVerificationTests('lifecycle-propagation',register),test);

import {registerPropagationVerificationTests} from './helpers/register-propagation-verification-tests.js';
await registerFullComponent('lifecycle-propagation','verify-propagation-retry',(register:ComponentTest)=>registerPropagationVerificationTests('lifecycle-propagation',register),test);

import {registerMaintenanceVerificationTests} from './helpers/register-maintenance-verification-tests.js';
await registerFullComponent('lifecycle-propagation','verify-maintenance',(register:ComponentTest)=>registerMaintenanceVerificationTests('lifecycle-propagation',register),test);

import {registerLifecyclePublicationRaceTests} from './helpers/register-lifecycle-publication-race-tests.js';
await registerFullComponent('lifecycle-propagation','verify-lifecycle-races',(register:ComponentTest)=>registerLifecyclePublicationRaceTests('lifecycle-propagation',register),test);
