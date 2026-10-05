import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LOCAL_POLICY, parseCreateTaskRequest, parseTaskCommand, parseLoginRequest, parseEventCursor, type LocalServicePort, type LocalStorePort } from './contracts.js';
import { LocalError, localAssert, toLocalError, errorBody } from './errors.js';

export const DEFAULT_LOCAL_ORIGINS = Object.freeze(['http://127.0.0.1:5173', 'http://localhost:5173']);
export const MAX_LOCAL_BODY_BYTES = 128 * 1024;
export interface LocalHttpOptions { service: LocalServicePort; port?: number; origins?: readonly string[] }
export interface LocalHttpHandle { baseUrl: string; server: Server; close(): Promise<void> }

function singleHeader(request: IncomingMessage, name: string): string | undefined {
  const count = request.rawHeaders.filter((_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === name).length;
  localAssert(count <= 1, 'INVALID_SCHEMA', 'Duplicate control headers are rejected.');
  const value = request.headers[name];
  localAssert(value === undefined || typeof value === 'string', 'INVALID_SCHEMA', 'A single header value is required.');
  return value;
}
function token(request: IncomingMessage): string {
  const value = singleHeader(request, 'authorization');
  localAssert(value !== undefined && /^Bearer [A-Za-z0-9_-]{16,512}$/.test(value), 'UNAUTHORIZED', 'A current local-test bearer session is required.');
  return value.slice(7);
}
function json(response: ServerResponse, status: number, value: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<unknown> {
  const media = singleHeader(request, 'content-type');
  localAssert(typeof media === 'string' && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(media), 'INVALID_SCHEMA', 'A JSON request body is required.');
  const length = singleHeader(request, 'content-length');
  if (length !== undefined) localAssert(/^\d+$/.test(length) && Number(length) <= MAX_LOCAL_BODY_BYTES, 'PAYLOAD_TOO_LARGE', 'The local request exceeds its body limit.');
  const chunks: Buffer[] = []; let count = 0;
  for await (const piece of request) {
    const chunk = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
    count += chunk.length;
    localAssert(count <= MAX_LOCAL_BODY_BYTES, 'PAYLOAD_TOO_LARGE', 'The local request exceeds its body limit.');
    chunks.push(chunk);
  }
  localAssert(count > 0, 'INVALID_SCHEMA', 'A complete JSON body is required.');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new LocalError('INVALID_SCHEMA', 'Malformed JSON request.'); }
}
function query(url: URL, names: readonly string[], required: readonly string[] = []): void {
  const keys = [...url.searchParams.keys()];
  localAssert(keys.every(key => names.includes(key)) && new Set(keys).size === keys.length && required.every(key => url.searchParams.has(key)), 'INVALID_SCHEMA', 'Unexpected or incomplete query parameters.');
}
function identifier(value: string): string {
  localAssert(/^[A-Za-z0-9._:-]{1,256}$/.test(value) && value !== '.' && value !== '..', 'INVALID_SCHEMA', 'A bounded opaque identifier is required.');
  return value;
}
function originList(origins: readonly string[]): Set<string> {
  const allowed = new Set<string>();
  for (const value of origins) {
    let url: URL;
    try { url = new URL(value); } catch { throw new LocalError('INVALID_SCHEMA', 'Invalid local origin configuration.'); }
    localAssert(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.origin === value && url.pathname === '/' && !url.username && !url.password, 'LOCAL_POLICY_VIOLATION', 'Origins must be exact HTTP loopback origins.');
    allowed.add(value);
  }
  return allowed;
}

/** Always binds 127.0.0.1. No runtime option grants public binding or provider access. */
export async function startLocalHttp(options: LocalHttpOptions): Promise<LocalHttpHandle> {
  localAssert(Object.keys(options).every(key => ['service', 'port', 'origins'].includes(key)), 'LOCAL_POLICY_VIOLATION', 'Unsupported local HTTP configuration.');
  const port = options.port ?? 0;
  localAssert(Number.isSafeInteger(port) && port >= 0 && port <= 65535, 'INVALID_SCHEMA', 'A valid local port is required.');
  const origins = originList(options.origins ?? DEFAULT_LOCAL_ORIGINS);
  const service = options.service;
  let baseUrl = '';
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Vary', 'Origin');
    try {
      const host = singleHeader(request, 'host');
      const actualPort = (server.address() as AddressInfo).port;
      localAssert(host === `127.0.0.1:${actualPort}` || host === `localhost:${actualPort}`, 'UNAUTHORIZED', 'Unexpected local Host header.');
      const origin = singleHeader(request, 'origin');
      localAssert(origin === undefined || origins.has(origin), 'UNAUTHORIZED', 'This browser origin is not authorized.');
      if (origin !== undefined) response.setHeader('Access-Control-Allow-Origin', origin);
      localAssert(request.url?.startsWith('/') && !request.url.startsWith('//') && !request.url.includes('\\'), 'INVALID_SCHEMA', 'Only local relative paths are supported.');
      const url = new URL(request.url!, baseUrl);
      localAssert(url.origin === baseUrl && !/%2f|%5c/i.test(url.pathname), 'INVALID_SCHEMA', 'Encoded path separators are rejected.');
      if (request.method === 'OPTIONS') {
        localAssert(origin !== undefined, 'UNAUTHORIZED', 'Preflight requires an authorized origin.');
        const method = singleHeader(request, 'access-control-request-method');
        localAssert(method !== undefined && ['GET', 'POST', 'DELETE'].includes(method), 'METHOD_NOT_ALLOWED', 'Unsupported preflight method.');
        const headers = singleHeader(request, 'access-control-request-headers');
        localAssert(headers === undefined || headers.split(',').every(header => ['authorization', 'content-type'].includes(header.trim().toLowerCase())), 'UNAUTHORIZED', 'Unsupported preflight headers.');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.statusCode = 204; response.end(); return;
      }
      const method = request.method ?? '';
      localAssert(['GET', 'POST', 'DELETE'].includes(method), 'METHOD_NOT_ALLOWED', 'Unsupported local method.');
      if (method !== 'POST') localAssert(request.headers['transfer-encoding'] === undefined && (!request.headers['content-length'] || request.headers['content-length'] === '0'), 'INVALID_SCHEMA', 'This method does not accept a body.');
      if (url.pathname === '/v1/health') {
        localAssert(method === 'GET', 'METHOD_NOT_ALLOWED', 'Health is read only.'); query(url, []);
        json(response, 200, { schemaVersion: 1, ...LOCAL_POLICY, status: 'ready', identityMode: 'local-test', store: 'sqlite-local-test', remoteQualification: false, realBillingQualification: false }); return;
      }
      if (url.pathname === '/v1/sessions/login') {
        localAssert(method === 'POST', 'METHOD_NOT_ALLOWED', 'Login requires POST.'); query(url, []);
        json(response, 200, service.login(parseLoginRequest(await body(request)))); return;
      }
      const bearer = token(request);
      service.me(bearer); // Fresh authentication before any body or owner dispatch.
      if (url.pathname === '/v1/sessions/current') {
        localAssert(method === 'DELETE', 'METHOD_NOT_ALLOWED', 'Logout requires DELETE.'); query(url, []);
        service.logout(bearer); response.statusCode = 204; response.end(); return;
      }
      if (url.pathname === '/v1/me' || url.pathname === '/v1/spaces') {
        localAssert(method === 'GET', 'METHOD_NOT_ALLOWED', 'This resource is read only.'); query(url, []);
        json(response, 200, url.pathname === '/v1/me' ? service.me(bearer) : service.spaces(bearer)); return;
      }
      if (url.pathname === '/v1/tasks') {
        if (method === 'POST') { query(url, []); json(response, 202, await service.createTask(bearer, parseCreateTaskRequest(await body(request)))); return; }
        localAssert(method === 'GET', 'METHOD_NOT_ALLOWED', 'Tasks support GET and POST.'); query(url, ['spaceId'], ['spaceId']);
        json(response, 200, service.listTasks(bearer, identifier(url.searchParams.get('spaceId')!))); return;
      }
      const commandMatch = /^\/v1\/commands\/([^/]+)$/.exec(url.pathname);
      if (commandMatch) {
        localAssert(method === 'GET', 'METHOD_NOT_ALLOWED', 'Command status is read only.'); query(url, ['spaceId'], ['spaceId']);
        const commandId = identifier(commandMatch[1]!), spaceId = identifier(url.searchParams.get('spaceId')!);
        const actor = service.me(bearer);
        localAssert(service.spaces(bearer).some(space => space.scope.spaceId === spaceId), 'UNAUTHORIZED', 'Current Space access required.');
        const owner = service as LocalServicePort & { store?: LocalStorePort };
        localAssert(owner.store, 'REQUIRED_CAPABILITY_UNSUPPORTED', 'This service does not expose an original command owner.');
        const row = owner.store.snapshot().commands.find(item => item.commandId === commandId && item.actorId === actor.actorId && item.scope.spaceId === spaceId && item.scope.tenantId === actor.tenantId);
        localAssert(row, 'NOT_FOUND', 'No original command is available to this identity.');
        const current = service.getTask(bearer, row.taskId);
        json(response, 200, { ...structuredClone(row.response), task: current, revision: current.task.revision, generation: current.task.generation }); return;
      }
      const taskMatch = /^\/v1\/tasks\/([^/]+)(?:\/(commands|events|result))?$/.exec(url.pathname);
      localAssert(taskMatch, 'NOT_FOUND', 'Unknown local API resource.');
      const taskId = identifier(taskMatch[1]!), suffix = taskMatch[2];
      if (suffix === 'commands') {
        localAssert(method === 'POST', 'METHOD_NOT_ALLOWED', 'Task commands require POST.'); query(url, []);
        service.getTask(bearer, taskId); // Current scope before accepting command input.
        json(response, 200, await service.command(bearer, taskId, parseTaskCommand(await body(request)))); return;
      }
      localAssert(method === 'GET', 'METHOD_NOT_ALLOWED', 'This Task resource is read only.');
      if (suffix === 'events') {
        query(url, ['streamId', 'sequence', 'generation']);
        const hasCursor = url.searchParams.size > 0;
        const cursor = hasCursor ? parseEventCursor({ streamId: url.searchParams.get('streamId'), sequence: Number(url.searchParams.get('sequence')), generation: Number(url.searchParams.get('generation')) }) : undefined;
        localAssert(!hasCursor || url.searchParams.size === 3, 'INVALID_SCHEMA', 'A complete cursor is required.');
        json(response, 200, service.events(bearer, taskId, cursor)); return;
      }
      query(url, []);
      json(response, 200, suffix === 'result' ? service.result(bearer, taskId) : service.getTask(bearer, taskId));
    } catch (error) { const safe = toLocalError(error); json(response, safe.status, errorBody(safe)); }
  });
  server.headersTimeout = 10000; server.requestTimeout = 30000; server.keepAliveTimeout = 3000;
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => reject(error);
    server.once('error', failed);
    server.listen(port, '127.0.0.1', () => { server.off('error', failed); resolve(); });
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let closing: Promise<void> | null = null;
  return { baseUrl, server, close() {
    if (closing) return closing;
    closing = new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    return closing;
  } };
}
