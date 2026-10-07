// Explicit required suites. Add implementations, never shrink this list to pass a gate.
export const suites = Object.freeze({
  contracts: 'contracts.test.js',
  'durable-authority': 'durable-authority.test.js',
  'temporal-worker': 'temporal-worker.test.js',
  'unknown-effects': 'unknown-effects.test.js',
  'stop-fences': 'stop-fences.test.js',
  'dispatch-schedules': 'dispatch-schedules.test.js',
  'results-notifications': 'results-notifications.test.js',
  qualification: 'qualification.test.js'
});
