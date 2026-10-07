import {sleep} from '@temporalio/workflow';
// Test-only incompatible deployment: timer command cannot replay the recorded
// first activity command. The real SDK must reject it as nondeterministic.
export async function nativeConversation(): Promise<void> {await sleep('1 second');}
