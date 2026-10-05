'use strict';
// These tests exercise Electron policy components through explicit event doubles.
// They do not attest that an Electron window was launched or a native UI flow ran.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { desktopPreferences, allowedNavigation, resourceAllowed, CSP_POLICY, permissionAllowed, installSecurity } = require('../security.cjs');

const external = [
  'https://example.com', 'http://localhost:5173', 'http://127.0.0.1:5174', 'https://127.0.0.1:5173',
  'http://127.0.0.1', 'http://127.0.0.1:80', 'http://127.0.0.1:5173.evil.example',
  'http://127.0.0.1:5173@evil.example', 'http://evil.example/#http://127.0.0.1:5173',
  'http://operator:password@127.0.0.1:5173', 'http://operator@127.0.0.1:5173/',
  'http://127.0.0.1:5173%40evil.example', 'http://127.0.0.1%2f.evil.example:5173/',
  'file:///etc/passwd', 'file:///Applications/App.app', 'data:text/html,<script>1</script>',
  'javascript:process.exit()', 'about:blank', 'blob:http://127.0.0.1:5173/example',
  'ftp://127.0.0.1:5173', '//127.0.0.1:5173', '/relative', '', null, undefined, {}, 5173,
];

function doubles() {
  const contents = new EventEmitter(); let openHandler, requestHandler, checkHandler;
  contents.setWindowOpenHandler = handler => { openHandler = handler; };
  const window = new EventEmitter(); window.webContents = contents;
  let resourceHandler, responseHandler;
  const session = Object.assign(new EventEmitter(), {
    setPermissionRequestHandler: handler => { requestHandler = handler; },
    setPermissionCheckHandler: handler => { checkHandler = handler; },
    webRequest: { onBeforeRequest: (_filter, handler) => { resourceHandler = handler; }, onHeadersReceived: (_filter, handler) => { responseHandler = handler; } },
  });
  installSecurity({ window, session });
  return { window, contents, session, resource: (...args) => resourceHandler(...args), response: (...args) => responseHandler(...args), open: details => openHandler(details), request: (...args) => requestHandler(...args), check: (...args) => checkHandler(...args), handlers: () => ({ openHandler, requestHandler, checkHandler }) };
}
function event() { let prevented = 0; return { preventDefault() { prevented++; }, get prevented() { return prevented; } }; }

test('Electron component policy disables renderer privileges', () => {
  const prefs = desktopPreferences();
  const required = {
    nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
    webviewTag: false, allowRunningInsecureContent: false,
  };
  for (const [name, expected] of Object.entries(required)) assert.equal(prefs[name], expected, name);
  assert.equal(prefs.nodeIntegrationInWorker, false); assert.equal(prefs.nodeIntegrationInSubFrames, false);
  assert.equal(prefs.experimentalFeatures, false);
  assert.equal(Object.hasOwn(prefs, 'enableRemoteModule') && prefs.enableRemoteModule, false);
  assert.equal(Object.hasOwn(prefs, 'nodeIntegrationInWorker') && prefs.nodeIntegrationInWorker, false);
  const again = desktopPreferences(); assert.deepEqual(again, prefs);
});

test('Electron component navigation compares an exact parsed origin', () => {
  for (const url of ['http://127.0.0.1:5173', 'http://127.0.0.1:5173/', 'http://127.0.0.1:5173/tasks/42', 'http://127.0.0.1:5173/?query=test#result', 'http://127.0.0.1:5173/tasks/%E4%BB%BB%E5%8A%A1']) {
    assert.equal(allowedNavigation(url), true, url);
  }
  for (const url of external) assert.equal(allowedNavigation(url), false, String(url));
  for (const url of [' http://127.0.0.1:5173/', 'http://127.0.0.1:5173/\n', 'http:\\127.0.0.1:5173/', 'http://%31%32%37.0.0.1:5173/']) {
    assert.equal(allowedNavigation(url), false, 'noncanonical or control-character URL cannot obtain navigation admission: ' + url);
  }
});

test('Electron component denies every permission regardless of renderer claims', () => {
  for (const permission of ['media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock', 'openExternal', 'unknown']) {
    assert.equal(permissionAllowed(permission, { requestingUrl: 'http://127.0.0.1:5173', isMainFrame: true, userGesture: true }), false);
  }
  assert.equal(permissionAllowed(), false);
});

test('Electron event doubles prevent external navigation and redirects', () => {
  const d = doubles();
  for (const kind of ['will-navigate', 'will-redirect']) {
    assert.ok(d.contents.listenerCount(kind) > 0, kind + ' requires a guard');
    for (const target of external) { const e = Object.assign(event(), { url: target }); d.contents.emit(kind, e); assert.equal(e.prevented, 1, kind + ' primary event.url: ' + String(target)); }
    const current = Object.assign(event(), { url: 'http://127.0.0.1:5173/task/1' }); d.contents.emit(kind, current); assert.equal(current.prevented, 0, kind + ' primary event.url admits a legitimate same-origin navigation');
    const allowed = event(); d.contents.emit(kind, allowed, 'http://127.0.0.1:5173/task/1'); assert.equal(allowed.prevented, 0);
  }
});

test('Electron event doubles deny child windows and embedded webviews', () => {
  const d = doubles(); assert.equal(typeof d.handlers().openHandler, 'function');
  for (const url of ['http://127.0.0.1:5173', ...external]) {
    assert.equal(d.open({ url, features: 'nodeIntegration=yes,webSecurity=no', disposition: 'new-window', referrer: { url: 'http://127.0.0.1:5173' } }).action, 'deny');
  }
  assert.ok(d.contents.listenerCount('will-attach-webview') > 0);
  const e = event(); const prefs = { nodeIntegration: true, preload: '/attacker.cjs', webSecurity: false };
  d.contents.emit('will-attach-webview', e, prefs, { src: 'http://127.0.0.1:5173', allowpopups: true });
  assert.equal(e.prevented, 1, 'no embedded webview is admitted');
});

test('Electron event doubles deny permission requests and checks without privileged callbacks', () => {
  const d = doubles(); assert.equal(typeof d.handlers().requestHandler, 'function'); assert.equal(typeof d.handlers().checkHandler, 'function');
  for (const permission of ['media', 'clipboard-read', 'geolocation', 'notifications', 'unknown']) {
    let callbacks = 0, result;
    d.request(d.contents, permission, value => { callbacks++; result = value; }, { requestingUrl: 'http://127.0.0.1:5173', userGesture: true });
    assert.equal(callbacks, 1); assert.equal(result, false);
    assert.equal(d.check(d.contents, permission, 'http://127.0.0.1:5173', { isMainFrame: true }), false);
  }
});

test('Electron event doubles reject external resources and prevent downloads/frame redirects', () => {
  const d = doubles();
  for (const url of ['http://127.0.0.1:5173/assets/app.js', 'http://127.0.0.1:8791/v1/tasks', 'ws://127.0.0.1:5173/']) {
    assert.equal(resourceAllowed(url), true); let result; d.resource({ url }, row => { result = row; }); assert.equal(result.cancel, false);
  }
  for (const url of ['https://supplier.invalid/model', 'http://127.0.0.1:8791@evil.example', 'http://localhost:8791', 'http://127.0.0.1:8792/v1/tasks', ...external]) {
    assert.equal(resourceAllowed(url), false); let calls = 0, result; d.resource({ url }, row => { calls++; result = row; }); assert.equal(calls, 1); assert.equal(result.cancel, true);
  }
  const download = event(); d.session.emit('will-download', download, { savePath: '/attacker' }); assert.equal(download.prevented, 1);
  const frame = Object.assign(event(), { url: 'https://evil.example/frame' }); d.contents.emit('will-frame-navigate', frame); assert.equal(frame.prevented, 1);
  const currentFrame = Object.assign(event(), { url: 'http://127.0.0.1:5173/tasks/1' }); d.contents.emit('will-frame-navigate', currentFrame); assert.equal(currentFrame.prevented, 0, 'Electron44 primary single Event signature must admit legitimate same-origin frames');
});

test('Electron response policy replaces attacker CSP rather than appending a weaker policy', () => {
  const d = doubles(); let result;
  d.response({ responseHeaders: { 'content-security-policy': ["default-src * 'unsafe-eval'"], 'Content-Security-Policy': ['default-src *'], 'Content-Type': ['text/html'] } }, row => { result = row; });
  const entries = Object.entries(result.responseHeaders).filter(([key]) => key.toLowerCase() === 'content-security-policy');
  assert.equal(entries.length, 1); assert.deepEqual(entries[0][1], [CSP_POLICY]);
  assert.deepEqual(result.responseHeaders['Content-Type'], ['text/html']); assert.deepEqual(result.responseHeaders['X-Content-Type-Options'], ['nosniff']);
  for (const directive of ["default-src 'none'", "script-src 'self'", "frame-src 'none'", "worker-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(CSP_POLICY.includes(directive));
  assert.ok(!CSP_POLICY.includes('unsafe-eval')); assert.ok(!/connect-src[^;]*\*/.test(CSP_POLICY));
});

test('Electron preload component exposes only frozen local qualification metadata', () => {
  let calls = 0, exposed;
  const source = readFileSync(join(__dirname, '../preload.cjs'), 'utf8');
  vm.runInNewContext(source, { require(name) {
    assert.equal(name, 'electron', 'preload cannot acquire another Node or process API');
    return { contextBridge: { exposeInMainWorld(key, value) { calls++; assert.equal(key, 'agentFabricLocalProfile'); exposed = value; } } };
  } }, { timeout: 1000, filename: 'preload.cjs' });
  assert.equal(calls, 1); assert.equal(Object.isFrozen(exposed), true);
  assert.equal(exposed.surface, 'electron'); assert.equal(exposed.identityMode, 'local-test');
  assert.equal(exposed.paidCallsAllowed, false); assert.equal(exposed.remoteAllowed, false);
  assert.equal(exposed.productionSSOQualified, false); assert.equal(exposed.signedDistributionQualified, false);
  for (const [key, value] of Object.entries(exposed)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), key + ' must carry metadata only');
    assert.ok(!/token|credential|secret|actorId|payerId|grants|ipc|execute|filesystem/i.test(key));
  }
});
