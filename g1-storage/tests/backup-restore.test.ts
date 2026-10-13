import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerBackupCaptureTests } from './helpers/backup-capture-component.js';
import { registerBackupComponent } from './helpers/backup-component.js';
import { registerRestoreImportTests } from './helpers/restore-import-component.js';
import { registerRestoreActivationTests } from './helpers/restore-activation-component.js';
import { registerRestoreProgressTests } from './helpers/restore-progress-component.js';
import { registerVerifyRestoreCurrentTests } from './helpers/verify-restore-current.js';
import { registerVerifyRestoreInterruptionTests } from './helpers/verify-restore-interruption.js';
import { registerVerifyRestoreIntegrityTests } from './helpers/verify-restore-integrity.js';
import { registerVerifyRestoreMeasurementTests } from './helpers/verify-restore-measurement.js';
// Each complete original/shared registration retains its component start state,
// global zero-effect oracles and owned encrypted roots. The existing fixture seam
// provides genuine migration rollback prerequisites and cleanup between groups.
// The R04 sample array stays in this process for the later R07 assertions.
const fixture = await import(pathToFileURL(resolve(process.env['STORAGE_REPO_ROOT']!, 'g1-storage/scripts/fixture.mjs')).href);
const registrations = [
 () => registerBackupCaptureTests(),
 () => registerBackupComponent(),
 () => registerRestoreImportTests(),
 () => registerRestoreActivationTests(),
 () => registerRestoreProgressTests(),
 () => registerVerifyRestoreCurrentTests(undefined, undefined, 'backup-restore'),
 () => registerVerifyRestoreInterruptionTests(undefined, undefined, 'backup-restore'),
 () => registerVerifyRestoreIntegrityTests(undefined, undefined, 'backup-restore'),
 () => registerVerifyRestoreMeasurementTests(undefined, undefined, 'backup-restore'),
];
for (const register of registrations) {
 await fixture.withStorageFixture(async (state: { env: Record<string, string> }) => {
  const previous = new Map(Object.keys(state.env).map(key => [key, process.env[key]]));
  try {
   Object.assign(process.env, state.env);
   await register();
  } finally {
   for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
   }
  }
 });
}
