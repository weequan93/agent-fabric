/** Frozen at test design; test case IDs must be real top-level test names.
 * No discovery, optional suites or argument that weakens aggregate acceptance.
 */
const ids = (prefix, n) => Object.freeze(Array.from({ length: n }, (_, i) => prefix + String(i + 1).padStart(2, '0')));
export const suites = Object.freeze({
 contracts: Object.freeze({ file: 'contracts.test.js', cases: ids('C', 3), integration: false }),
 'profile-context': Object.freeze({ file: 'profile-context.test.js', cases: ids('P', 13), integration: true }),
 'budget-concurrency': Object.freeze({ file: 'budget-concurrency.test.js', cases: ids('B', 9), integration: true }),
 'retry-usage-recovery': Object.freeze({ file: 'retry-usage-recovery.test.js', cases: ids('U', 11), integration: true }),
 'native-wait-resource': Object.freeze({ file: 'native-wait-resource.test.js', cases: ids('N', 8), integration: true }),
 'authority-output': Object.freeze({ file: 'authority-output.test.js', cases: ids('A', 6), integration: true }),
 qualification: Object.freeze({ file: 'qualification.test.js', cases: ids('Q', 9), integration: true }),
 'operator-journeys': Object.freeze({ file: 'operator-journeys.test.js', cases: ids('J', 6), integration: true })
});
export const components = Object.freeze({
 contracts: Object.freeze({ file: 'components/contracts.component.test.js', cases: Object.freeze(['CONTRACTS/profile-receipt', 'CONTRACTS/closed-negative', 'CONTRACTS/arithmetic', 'CONTRACTS/native-identity', 'CONTRACTS/harness']), integration: false }),
 adapter: Object.freeze({ file: 'components/adapter.component.test.js', cases: Object.freeze(['ADAPTER/roundtrip-recovery']), integration: true }),
 profile: Object.freeze({ file: 'components/profile.component.test.js', cases: Object.freeze(['PROFILE/selection-context']), integration: true }),
 ledger: Object.freeze({ file: 'components/ledger.component.test.js', cases: Object.freeze(['LEDGER/atomic-contention']), integration: true }),
 usage: Object.freeze({ file: 'components/usage.component.test.js', cases: Object.freeze(['USAGE/retry-reconcile']), integration: true }),
 native: Object.freeze({ file: 'components/native.component.test.js', cases: Object.freeze(['NATIVE/wait-stop']), integration: true }),
 resource: Object.freeze({ file: 'components/resource.component.test.js', cases: Object.freeze(['RESOURCE/interval-lifecycle']), integration: true })
});
if (Object.keys(suites).length !== 8 || Object.values(suites).reduce((n, s) => n + s.cases.length, 0) !== 65) throw new Error('Approved suite/case manifest corrupt');
