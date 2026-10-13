// All component assertions remain mandatory in the full suite. Native Ask,
// disclosure and frozen Q01-Q09 journeys are added by their owning tasks.
import { registerRecallBrokerTests } from './helpers/register-recall-broker-tests.js';
await registerRecallBrokerTests();
import { registerNativeAskTests } from './helpers/native-ask-component.js';
await registerNativeAskTests();
import { registerAskDisclosureTests } from './helpers/ask-disclosure-component.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Native Ask installs both 21 and 22. Disclosure's original migration rollback
// requires 22 to be unapplied, so run that complete original registration in a
// fresh fixture through the same owned setup/cleanup seam as component checks.
const fixture = await import(pathToFileURL(resolve(process.env['STORAGE_REPO_ROOT']!, 'g1-storage/scripts/fixture.mjs')).href);
await fixture.withStorageFixture(async (state: { env: Record<string, string> }) => {
 const previous = new Map(Object.keys(state.env).map(key => [key, process.env[key]]));
 try {
  Object.assign(process.env, state.env);
  // The parent test promise includes all its awaited original subtests and its
  // PG/IdP cleanup; keep the fresh fixture bound until that promise settles.
  await registerAskDisclosureTests();
 } finally {
  for (const [key, value] of previous) {
   if (value === undefined) delete process.env[key];
   else process.env[key] = value;
  }
 }
});
import { registerVerifyAskRecallTests } from './helpers/verify-ask-recall.js';
await registerVerifyAskRecallTests(undefined, undefined, 'recall-ask');
import { registerAskDisclosureVerificationTests } from './helpers/verify-ask-disclosure.js';
await registerAskDisclosureVerificationTests('recall-ask');
import { registerAskRoutingVerificationTests } from './helpers/verify-ask-routing.js';
await registerAskRoutingVerificationTests('recall-ask');
