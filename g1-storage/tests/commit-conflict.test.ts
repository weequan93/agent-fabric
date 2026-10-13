// Full suite runs the same component assertions; mandatory K01-K09 journey
// registration is delivered by f05-04-gate and remains required by the manifest.
import { registerAtomicSaveTests } from './helpers/register-atomic-save-tests.js';
import { registerKnowledgeStatusTests } from './helpers/register-knowledge-status-tests.js';
registerAtomicSaveTests();
registerKnowledgeStatusTests();

import { registerKnowledgeCorrectionTests } from './helpers/register-knowledge-correction-tests.js';
registerKnowledgeCorrectionTests();

import { registerCommandRecoveryTests } from './helpers/register-command-recovery-tests.js';
registerCommandRecoveryTests();

import { registerArtifactPublicationTests } from './helpers/register-artifact-publication-tests.js';
registerArtifactPublicationTests();

import {registerAtomicVerificationTests} from './helpers/register-atomic-verification-tests.js';
await registerAtomicVerificationTests('commit-conflict');

import {registerKnowledgeVerificationTests} from './helpers/register-knowledge-verification-tests.js';
await registerKnowledgeVerificationTests('commit-conflict');

import {registerArtifactVerificationTests} from './helpers/register-artifact-verification-tests.js';
await registerArtifactVerificationTests('commit-conflict');
