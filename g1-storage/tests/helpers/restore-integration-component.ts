import test from 'node:test';
import { registerRestoreActivationTests } from './restore-activation-component.js';
import { registerRestoreProgressTests } from './restore-progress-component.js';
import { emitObservations } from './observations.js';

/** Original entry points run every predecessor assertion and emit that exact
 * fixture's observations. No schedules, counters or product logic are added. */
export function registerRestoreIntegration(suite: 'restore' | 'restore-recovery') {
 const register = suite === 'restore' ? registerRestoreActivationTests : registerRestoreProgressTests;
 return register((name, body) => test(suite.toUpperCase()+'/behavior / '+name, body),
  value => emitObservations({...value, suite}));
}
