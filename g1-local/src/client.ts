// Runtime imports are browser safe. G0/Node types disappear during compilation.
import { parseCreateTaskRequest, parseTaskCommand, parseLoginRequest, parseEventCursor, type LocalClientPort, type LoginRequest, type LoginResponse, type TestIdentity, type LocalSpace, type CreateTaskRequest, type CommandResponse, type TaskCommand, type TaskView, type EventCursor, type TaskSync, type LocalArtifact, type HealthResponse } from './contracts.js';
import { LocalError, LOCAL_ERROR_CODES, type LocalErrorCode } from './errors.js';

export type DeliveryStatus = 'confirmed' | 'not-delivered' | 'unknown';
export interface ClientDelivery { status: DeliveryStatus; commandId: string | null; taskId: string | null }
export class ClientTransportError extends Error {
  readonly delivery: 'not-delivered' | 'unknown';
  readonly nextAction: string;
  constructor(readonly code: 'NOT_DELIVERED' | 'UNKNOWN_DELIVERY' | 'CONNECTION_LOST', readonly commandId: string | null = null, readonly taskId: string | null = null) {
    super(code === 'NOT_DELIVERED' ? 'Not delivered: the client is offline.' : code === 'UNKNOWN_DELIVERY' ? 'Delivery is unknown: query the original command before taking another action.' : 'Connection lost: reconnect and refresh authorized state.');
    this.name = 'ClientTransportError';
    this.delivery = code === 'NOT_DELIVERED' ? 'not-delivered' : 'unknown';
    this.nextAction = code === 'NOT_DELIVERED' ? 'Reconnect; explicitly decide whether to submit this unsent command.' : 'Reconnect and query the original command; no automatic resend occurred.';
  }
}
export interface LocalClientOptions { fetch?: typeof globalThis.fetch }
function id(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,256}$/.test(value) || value === '.' || value === '..') throw new LocalError('INVALID_SCHEMA', 'A bounded identifier is required.');
  return encodeURIComponent(value);
}
function labels(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LocalError('INVALID_SCHEMA', 'Invalid local API response.');
  const row = value as Record<string, unknown>;
  if (row.modelMode !== 'deterministic-test' || row.effectMode !== 'synthetic-only' || row.paidCallsAllowed !== false || row.remoteAllowed !== false) throw new LocalError('LOCAL_POLICY_VIOLATION', 'The response does not match the fixed local profile.');
}
export class LocalClient implements LocalClientPort {
  readonly baseUrl: string;
  private bearer: string | null = null;
  private online = true;
  private readonly fetcher: typeof globalThis.fetch;
  unsentDraft: string | null = null;
  lastDelivery: ClientDelivery | null = null;
  constructor(baseUrl: string, options: LocalClientOptions = {}) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new LocalError('LOCAL_POLICY_VIOLATION', 'The local SDK accepts only an HTTP loopback base URL.');
    this.baseUrl = url.origin;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }
  get connectionState(): 'online' | 'offline' { return this.online ? 'online' : 'offline'; }
  get connected(): boolean { return this.online; }
  disconnect(): void { this.online = false; }
  async reconnect(taskId?: string): Promise<TaskView | null> {
    this.online = true;
    try { return taskId ? await this.getTask(taskId) : (await this.me(), null); }
    catch (error) { if (error instanceof ClientTransportError) this.online = false; throw error; }
  }
  private async request<T>(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', value?: unknown, identity?: { commandId: string; taskId: string | null }, authenticated = true): Promise<T> {
    if (!this.online) {
      this.lastDelivery = { status: 'not-delivered', commandId: identity?.commandId ?? null, taskId: identity?.taskId ?? null };
      throw new ClientTransportError('NOT_DELIVERED', identity?.commandId ?? null, identity?.taskId ?? null);
    }
    if (authenticated && !this.bearer) throw new LocalError('UNAUTHORIZED', 'Log in with a local-test identity.');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.bearer && authenticated) headers.Authorization = 'Bearer ' + this.bearer;
    if (value !== undefined) headers['Content-Type'] = 'application/json';
    const init: RequestInit = { method, headers, redirect: 'error', cache: 'no-store', credentials: 'omit' };
    if (value !== undefined) init.body = JSON.stringify(value);
    let response: Response;
    try { response = await this.fetcher(this.baseUrl + path, init); }
    catch {
      this.online = false;
      if (method !== 'GET') {
        this.lastDelivery = { status: 'unknown', commandId: identity?.commandId ?? null, taskId: identity?.taskId ?? null };
        throw new ClientTransportError('UNKNOWN_DELIVERY', identity?.commandId ?? null, identity?.taskId ?? null);
      }
      throw new ClientTransportError('CONNECTION_LOST');
    }
    if (response.status === 204) return undefined as T;
    let payload: unknown;
    try { payload = await response.json(); }
    catch {
      if (method !== 'GET') { this.lastDelivery = { status: 'unknown', commandId: identity?.commandId ?? null, taskId: identity?.taskId ?? null }; throw new ClientTransportError('UNKNOWN_DELIVERY', identity?.commandId ?? null, identity?.taskId ?? null); }
      throw new LocalError('INVALID_SCHEMA', 'The local API response is incomplete.');
    }
    if (!response.ok) {
      const error = (payload as { error?: { code?: unknown; message?: unknown; nextAction?: unknown; retryable?: unknown } } | null)?.error;
      if (method !== 'GET' && response.status >= 500) { this.lastDelivery = { status: 'unknown', commandId: identity?.commandId ?? null, taskId: identity?.taskId ?? null }; throw new ClientTransportError('UNKNOWN_DELIVERY', identity?.commandId ?? null, identity?.taskId ?? null); }
      const code = LOCAL_ERROR_CODES.includes(error?.code as LocalErrorCode) ? error!.code as LocalErrorCode : 'INTERNAL_ERROR';
      // A denied action does not establish that the session was revoked.
      // The server revalidates the bearer on every request; logout clears it explicitly.
      throw new LocalError(code, typeof error?.message === 'string' ? error.message : 'The local API rejected this request.', typeof error?.nextAction === 'string' ? error.nextAction : undefined);
    }
    if (identity) this.lastDelivery = { status: 'confirmed', commandId: identity.commandId, taskId: identity.taskId ?? (payload as CommandResponse).taskId ?? null };
    return payload as T;
  }
  async health(): Promise<HealthResponse> { const value = await this.request<HealthResponse>('/v1/health', 'GET', undefined, undefined, false); labels(value); return value; }
  async login(input: LoginRequest): Promise<LoginResponse> {
    const value = await this.request<LoginResponse>('/v1/sessions/login', 'POST', parseLoginRequest(input), undefined, false);
    labels(value);
    if (typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{16,512}$/.test(value.token) || value.identity?.identityMode !== 'local-test') throw new LocalError('INVALID_SCHEMA', 'Invalid local login response.');
    this.bearer = value.token; return value;
  }
  async logout(): Promise<void> { await this.request<void>('/v1/sessions/current', 'DELETE'); this.bearer = null; }
  me(): Promise<TestIdentity> { return this.request('/v1/me'); }
  spaces(): Promise<LocalSpace[]> { return this.request('/v1/spaces'); }
  async listTasks(spaceId: string): Promise<TaskView[]> { const views = await this.request<TaskView[]>('/v1/tasks?spaceId=' + id(spaceId)); if (!Array.isArray(views)) throw new LocalError('INVALID_SCHEMA', 'Invalid task list.'); views.forEach(labels); return views; }
  async createTask(input: CreateTaskRequest): Promise<CommandResponse> { const request = parseCreateTaskRequest(input); const value = await this.request<CommandResponse>('/v1/tasks', 'POST', request, { commandId: request.commandId, taskId: null }); labels(value); return value; }
  async getTask(taskId: string): Promise<TaskView> { const view = await this.request<TaskView>('/v1/tasks/' + id(taskId)); labels(view); if (view.task?.taskId !== taskId) throw new LocalError('SCOPE_MISMATCH', 'The response changed the immutable Task target.'); return view; }
  async command(taskId: string, input: TaskCommand): Promise<CommandResponse> { const command = parseTaskCommand(input); const value = await this.request<CommandResponse>('/v1/tasks/' + id(taskId) + '/commands', 'POST', command, { commandId: command.commandId, taskId }); labels(value); if (value.taskId !== taskId || value.commandId !== command.commandId) throw new LocalError('SCOPE_MISMATCH', 'The command response changed its identity.'); return value; }
  async queryCommand(commandId: string, spaceId: string): Promise<CommandResponse> { const value = await this.request<CommandResponse>('/v1/commands/' + id(commandId) + '?spaceId=' + id(spaceId)); labels(value); if (value.commandId !== commandId || value.task?.task.scope.spaceId !== spaceId) throw new LocalError('SCOPE_MISMATCH', 'Original command identity changed.'); return value; }
  events(taskId: string, cursor?: EventCursor): Promise<TaskSync> { const parsed = cursor ? parseEventCursor(cursor) : undefined; const suffix = parsed ? '?streamId=' + id(parsed.streamId) + '&sequence=' + parsed.sequence + '&generation=' + parsed.generation : ''; return this.request('/v1/tasks/' + id(taskId) + '/events' + suffix); }
  result(taskId: string): Promise<LocalArtifact> { return this.request('/v1/tasks/' + id(taskId) + '/result'); }
}
