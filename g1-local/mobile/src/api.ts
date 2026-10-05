import { LocalClient } from '../../src/client';
export { LocalClient, ClientTransportError } from '../../src/client';
export type { ClientDelivery } from '../../src/client';
export type { TaskView, TaskSync, TestIdentity, LocalSpace, LocalIntent, TaskCommand, CommandResponse } from '../../src/contracts';
/** adb reverse tcp:8791 tcp:8791 binds the emulator to the same loopback API. */
export function createClient(): LocalClient {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  return new LocalClient('http://127.0.0.1:8791', {
    fetch(input, init) {
      // RN's whatwg-fetch implements no-store by appending an unsupported query
      // parameter. The server already sends Cache-Control: no-store. Omit only
      // this native compatibility option; retain every other SDK request field.
      const { cache: unsupportedCache, ...nativeInit } = init ?? {};
      return nativeFetch(input, nativeInit);
    },
  });
}
