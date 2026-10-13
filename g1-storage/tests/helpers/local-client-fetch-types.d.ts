// The accepted browser-safe LocalClient uses standard Fetch options. F05's
// Node-only compilation follows that source without changing its accepted bytes
// or adding the browser DOM library to the storage compiler boundary.
export {};
declare global {
 interface RequestInit {
  cache?: 'default'|'no-store'|'reload'|'no-cache'|'force-cache'|'only-if-cached';
  credentials?: 'omit'|'same-origin'|'include';
 }
}
