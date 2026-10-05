import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalClient, ClientTransportError, type ClientDelivery } from '../../src/client.js';
import type { TaskView, TaskSync, TestIdentity, LocalSpace, LocalIntent, TaskCommand, CommandResponse } from '../../src/contracts.js';
import './styles.css';
export { LocalClient, ClientTransportError };

/** Never use an unscoped global current Space to reinterpret a response. */
export function mergeTaskView(current: TaskView | null, incoming: TaskView): TaskView {
  if (incoming.schemaVersion !== 1 || incoming.modelMode !== 'deterministic-test' || incoming.effectMode !== 'synthetic-only' || incoming.paidCallsAllowed !== false || incoming.remoteAllowed !== false) throw Error('Unsupported local response');
  if (!current) return incoming;
  if (current.task.taskId !== incoming.task.taskId || current.task.scope.tenantId !== incoming.task.scope.tenantId || current.task.scope.spaceId !== incoming.task.scope.spaceId || current.cursor.streamId !== incoming.cursor.streamId) throw Error('Immutable Task/Space mismatch');
  if (incoming.authorityRevision < current.authorityRevision || incoming.task.revision < current.task.revision || incoming.task.generation < current.task.generation || incoming.cursor.generation < current.cursor.generation || (incoming.cursor.generation === current.cursor.generation && incoming.cursor.sequence < current.cursor.sequence)) return current;
  return incoming;
}
export function applyTaskSync(current: TaskView, sync: TaskSync): TaskView {
  if (sync.kind === 'snapshot') return mergeTaskView(current, sync.snapshot);
  if (sync.scope.spaceId !== current.task.scope.spaceId || sync.scope.tenantId !== current.task.scope.tenantId || sync.cursor.streamId !== current.cursor.streamId) throw Error('Wrong event scope');
  if (sync.authorityRevision < current.authorityRevision) return current;
  if (sync.cursor.generation !== current.cursor.generation) throw Error('Snapshot required for new generation');
  let next = current, sequence = current.cursor.sequence;
  for (const event of sync.events) {
    if (event.taskId !== current.task.taskId || event.scope.spaceId !== current.task.scope.spaceId || event.scope.tenantId !== current.task.scope.tenantId || event.generation !== current.cursor.generation) throw Error('Wrong event binding');
    if (event.sequence <= sequence) continue;
    if (event.sequence !== sequence + 1 || event.task.cursor.sequence !== event.sequence) throw Error('Event gap: refresh authorized snapshot');
    next = mergeTaskView(next, event.task); sequence = event.sequence;
  }
  if (sequence !== sync.cursor.sequence) throw Error('Incomplete event cursor');
  return next;
}
export function deliveryMessage(delivery: ClientDelivery | null): string {
  if (!delivery) return 'No command submitted.';
  return delivery.status === 'not-delivered' ? 'Not delivered. Reconnect, then decide explicitly whether to send.' : delivery.status === 'unknown' ? 'Delivery unknown. Query the original command; do not resend.' : 'Request acknowledged. Check the authoritative outcome below.';
}
const credentials = {operator:'operator-local-test',approver:'approver-local-test',viewer:'viewer-local-test',outsider:'outsider-local-test'};
type Account = keyof typeof credentials;
const commandId = () => 'web-' + crypto.randomUUID();
function App() {
  const client = useRef(new LocalClient('http://127.0.0.1:8791')).current;
  const [identity,setIdentity]=useState<TestIdentity|null>(null), [account,setAccount]=useState<Account>('operator'), [password,setPassword]=useState(credentials.operator);
  const [spaces,setSpaces]=useState<LocalSpace[]>([]), [spaceId,setSpaceId]=useState(''), [tasks,setTasks]=useState<TaskView[]>([]), [view,setView]=useState<TaskView|null>(null);
  const [selectedId,setSelectedId]=useState(''), [taskInput,setTaskInput]=useState(''), [title,setTitle]=useState(''), [intent,setIntent]=useState<LocalIntent>('ask'), [explicit,setExplicit]=useState(false);
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState(''), [online,setOnline]=useState(true), [delivery,setDelivery]=useState<ClientDelivery|null>(null), [lastResponse,setLastResponse]=useState<CommandResponse|null>(null);
  const viewRef=useRef<TaskView|null>(null), binding=useRef({spaceId:'',taskId:''}), epoch=useRef(0), inFlight=useRef(false), drafts=useRef(new Map<string,string>()), original=useRef<{commandId:string;spaceId:string;taskId:string|null}|null>(null);
  const draftKey=()=>`${identity?.actorId ?? 'anonymous'}:${binding.current.spaceId}:${binding.current.taskId || 'new'}`;
  const saveDraft=()=>drafts.current.set(draftKey(),taskInput);
  function install(incoming:TaskView|null) { viewRef.current=incoming; setView(incoming); }
  function accept(incoming:TaskView) { if(binding.current.taskId===incoming.task.taskId && binding.current.spaceId===incoming.task.scope.spaceId) install(mergeTaskView(viewRef.current,incoming)); }
  function failure(e:unknown,read=false) {
    setError(e instanceof Error ? e.message : 'Request failed. Refresh the authorized state.');
    setOnline(client.connected); setDelivery(client.lastDelivery);
    if(read && e && typeof e==='object' && 'code' in e && e.code==='UNAUTHORIZED') { install(null); setTasks([]); }
  }
  async function action(fn:()=>Promise<void>) { if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await fn();}catch(e){failure(e);}finally{inFlight.current=false;setBusy(false);setOnline(client.connected);setDelivery(client.lastDelivery);} }
  async function list(id=binding.current.spaceId) { const stamp=epoch.current; const rows=await client.listTasks(id); if(stamp===epoch.current && binding.current.spaceId===id)setTasks(rows); }
  async function pickTask(id:string) { saveDraft(); const stamp=++epoch.current; binding.current.taskId=id;setSelectedId(id);install(null);setLastResponse(null);setTaskInput(drafts.current.get(draftKey())??'');if(!id)return;try{const incoming=await client.getTask(id);if(stamp===epoch.current)accept(incoming);}catch(e){failure(e,true);} }
  async function pickSpace(id:string) { saveDraft(); ++epoch.current;binding.current={spaceId:id,taskId:''};setSpaceId(id);setSelectedId('');setTasks([]);install(null);setLastResponse(null);setTaskInput(drafts.current.get(draftKey())??'');setExplicit(false);try{await list(id);}catch(e){failure(e,true);} }
  async function login() { ++epoch.current; const response=await client.login({username:account,password}); const rows=await client.spaces();setIdentity(response.identity);setSpaces(rows);binding.current={spaceId:'',taskId:''};setSpaceId('');setSelectedId('');install(null);setTasks([]);setTaskInput('');setOnline(true);setNotice('Signed in with a local-test identity. Choose a Space.'); }
  async function create() {
    if(!binding.current.spaceId)throw Error('Choose a Space first.');
    const target=binding.current.spaceId, stamp=epoch.current, id=commandId();original.current={commandId:id,spaceId:target,taskId:null};client.unsentDraft=taskInput;
    const response=await client.createTask({spaceId:target,title,input:taskInput,intent,explicitTrigger:explicit,commandId:id});
    if(stamp!==epoch.current||binding.current.spaceId!==target)return;
    saveDraft();binding.current.taskId=response.taskId;setSelectedId(response.taskId);setLastResponse(response);original.current.taskId=response.taskId;
    if(response.task)accept(response.task);setNotice('Task accepted: '+response.taskId);await list(target);
  }
  async function submit(kind:'reviseTask'|'startRun'|'approve'|'stop') {
    const current=viewRef.current;if(!current)throw Error('Select an authorized Task first.');
    const id=commandId(), target=current.task.taskId, scope=current.task.scope.spaceId, stamp=epoch.current;
    original.current={commandId:id,spaceId:scope,taskId:target};
    let command:TaskCommand;
    if(kind==='stop')command={commandId:id,kind,scope:'task',expectedRevision:current.task.revision};
    else if(kind==='reviseTask')command={commandId:id,kind,input:taskInput,expectedRevision:current.task.revision};
    else {if(!current.plan)throw Error('No current Plan is available.');command={commandId:id,kind,planVersion:current.plan.version,expectedRevision:current.task.revision};}
    const response=await client.command(target,command);
    if(stamp!==epoch.current||binding.current.taskId!==target)return;
    setLastResponse(response);if(response.task)accept(response.task);setNotice(response.reason ?? 'Command accepted: '+id);await list(scope);
  }
  async function reconnect() { const target=binding.current.taskId, stamp=epoch.current;const restored=await client.reconnect(target||undefined);if(stamp!==epoch.current)return;if(restored)accept(restored);await list();setOnline(true);setNotice('Authorized state refreshed. Draft and unsent controls were not submitted.'); }
  async function queryOriginal() {
    const saved=original.current;if(!saved)throw Error('No original command to query.');
    const stamp=epoch.current,result=await client.queryCommand(saved.commandId,saved.spaceId);
    if(stamp!==epoch.current || binding.current.spaceId!==saved.spaceId || original.current!==saved)return;
    client.lastDelivery={status:'confirmed',commandId:saved.commandId,taskId:result.taskId};setDelivery(client.lastDelivery);
    if(saved.taskId===null && !binding.current.taskId && result.task && result.task.task.scope.spaceId===saved.spaceId) {
      saveDraft();binding.current.taskId=result.taskId;setSelectedId(result.taskId);saved.taskId=result.taskId;install(null);await list(saved.spaceId);
    }
    setNotice('Original command: '+result.acceptance+' / '+result.completion);
    if(result.task)accept(result.task);if(binding.current.taskId===result.taskId)setLastResponse(result);
  }
  useEffect(()=>{ if(!identity||!selectedId||!online)return; const timer=setInterval(()=>{if(inFlight.current)return;const stamp=epoch.current,current=viewRef.current;if(!current)return;void client.events(current.task.taskId,current.cursor).then(sync=>{if(stamp===epoch.current)install(applyTaskSync(viewRef.current??current,sync));}).catch(e=>{if(stamp!==epoch.current)return; if(e instanceof ClientTransportError)failure(e,true);else void client.getTask(current.task.taskId).then(v=>{if(stamp===epoch.current)accept(v);}).catch(err=>failure(err,true));});},1500);return()=>clearInterval(timer);},[identity,selectedId,online]);
  const space=spaces.find(s=>s.scope.spaceId===spaceId), run=view?.runs.at(-1), request=view?.plan?.approvalRequest;
  const inactive=busy||!view;
  return <div className="shell">
    <header className="mast"><a href="#main" className="skip">Skip to work</a><div className="brand">Agent Fabric <span className="pill">Local test</span></div><div className="profile">deterministic-test · synthetic-only · paid API disabled</div></header>
    <aside className="sidebar"><h2>Workspace</h2><p className="muted">Synthetic data · local-test identities</p><nav aria-label="Primary"><a href="#main">Spaces &amp; work</a><a href="#result">Result</a><a href="#controls">Task controls</a></nav>
      <form onSubmit={e=>{e.preventDefault();void action(login);}}><label>Test account<select aria-label="Test account" value={account} onChange={e=>{const value=e.target.value as Account;setAccount(value);setPassword(credentials[value]);}}>{Object.keys(credentials).map(name=><option key={name} value={name}>{name}</option>)}</select></label><label>Test password<input aria-label="Test password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off"/></label><button disabled={busy}>Log in</button></form>
      {identity&&<><p data-testid="identity"><b>{identity.username}</b> · {identity.role}<br/><small>{identity.actorId}</small></p><button className="secondary" disabled={busy} onClick={()=>void action(async()=>{await client.logout();++epoch.current;setIdentity(null);setSpaces([]);setTasks([]);install(null);binding.current={spaceId:'',taskId:''};setSpaceId('');setSelectedId('');setTaskInput('');setNotice('Logged out. Session materials were not persisted.');})}>Log out</button></>}
      <p className="boundary">This build has no remote computer, real model billing, production SSO or signed distribution qualification.</p>
    </aside>
    <main id="main"><div className="heading"><div><p className="eyebrow">Spaces / Work</p><h1>Continue the same task</h1></div><span className={'pill '+(online?'good':'warn')}>{online?'Online':'Offline · last known state'}</span></div>
      <section className="card" aria-label="Task selection"><div className="row"><label>Space<select aria-label="Space" value={spaceId} disabled={!identity||busy} onChange={e=>void action(()=>pickSpace(e.target.value))}><option value="">Choose a Space</option>{spaces.map(s=><option key={s.scope.spaceId} value={s.scope.spaceId}>{s.name} · {s.kind}</option>)}</select></label><label>Task<select aria-label="Task" value={selectedId} disabled={!spaceId||busy} onChange={e=>void action(()=>pickTask(e.target.value))}><option value="">New task</option>{tasks.map(t=><option key={t.task.taskId} value={t.task.taskId}>{t.task.title} · {t.task.taskId}</option>)}</select></label><button className="secondary" disabled={!identity||busy||!online} onClick={()=>void action(async()=>{await list();if(selectedId)accept(await client.getTask(selectedId));})}>Refresh</button></div>{space&&<p className="muted">{space.kind} audience · {space.scope.tenantId} / {space.scope.spaceId} · payer {space.payerId}</p>}{identity&&spaceId&&tasks.length===0&&<p>No tasks yet. Create an authorized local task below.</p>}</section>
      <div aria-live="polite" role="status">{busy&&<p className="banner">Loading authorized state…</p>}{notice&&<p className="banner">{notice}</p>}</div>{error&&<div role="alert" className="banner error">{error}<br/><small>Refresh current state or use an authorized test account. No automatic resend.</small></div>}
      <section className="card" aria-label="Task composer"><h2>{selectedId?'Update this task':'New task'}</h2><form onSubmit={e=>{e.preventDefault();void action(selectedId?()=>submit('reviseTask'):create);}}>{!selectedId&&<div className="row"><label>Task title<input aria-label="Task title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={256} required/></label><label>Intent<select aria-label="Intent" value={intent} onChange={e=>setIntent(e.target.value as LocalIntent)}><option value="ask">Ask</option><option value="plan">Plan</option><option value="act">Act · simulation</option></select></label></div>}<label>Request / correction<textarea aria-label="Request / correction" value={taskInput} required maxLength={16384} onChange={e=>{setTaskInput(e.target.value);client.unsentDraft=e.target.value;drafts.current.set(draftKey(),e.target.value);}}/></label><p className="muted">Draft not sent. Reconnection never submits this text.</p>{space?.kind==='group'&&!selectedId&&<label className="check"><input type="checkbox" checked={explicit} onChange={e=>setExplicit(e.target.checked)}/>Explicitly trigger the agent for this group task</label>}<button disabled={busy||!identity||!spaceId}>{selectedId?'Submit correction':'Create task'}</button></form></section>
      {view?<><section className="card" id="controls"><div className="row"><h2>{view.task.title}</h2><span className="pill">{view.task.stopped?'Dispatch fenced':run?.state??'Pending'}</span></div><dl className="facts"><div><dt>Task ID</dt><dd data-testid="task-id">{view.task.taskId}</dd></div><div><dt>Scope</dt><dd>{view.task.scope.spaceId}</dd></div><div><dt>Owner / payer</dt><dd>{view.task.ownerActorId} / {view.task.payerId}</dd></div><div><dt>Revision / generation</dt><dd data-testid="revision">{view.task.revision} / {view.task.generation}</dd></div><div><dt>Sources</dt><dd>{view.task.sourceIds.join(', ')||'No attached sources'}</dd></div><div><dt>Last update</dt><dd>{new Date(view.lastUpdate).toLocaleString()}</dd></div></dl>
        {run?.waiting&&<div className="banner warn" data-testid="waiting"><b>Waiting: {run.waiting.reason}</b><p>{run.waiting.nextAction}</p></div>}
        <div className="buttons"><button disabled={inactive||!view.plan||view.task.stopped} onClick={()=>void action(()=>submit('startRun'))}>Start synthetic run</button><button className="secondary" disabled={inactive||!request||view.task.stopped} onClick={()=>void action(()=>submit('approve'))}>Approve exact plan</button><button className="danger" disabled={inactive} onClick={()=>void action(()=>submit('stop'))}>Stop task</button></div>
        <p className="muted">Approvals require a separate approver identity. Stop rechecks current authority even when progress is stale. No workstation processes run in this profile.</p>
        {request&&<details><summary>Exact approval request · Plan {request.planVersion}</summary><dl className="facts"><div><dt>Target</dt><dd>{request.target}</dd></div><div><dt>Binding</dt><dd>{request.bindingDigest}</dd></div><div><dt>Expiry</dt><dd>{new Date(request.expiresAt).toLocaleString()}</dd></div></dl></details>}
        {view.plan&&<div><h3>Plan version {view.plan.version}</h3><ol>{view.plan.steps.map(step=><li key={step.stepId}>{step.description} <small>({step.effect})</small></li>)}</ol></div>}
        {lastResponse?.stop&&<p data-testid="stop-receipt">Request accepted · Dispatch fenced · in-flight {lastResponse.stop.inFlight}. Process termination: not applicable to synthetic-only.</p>}
      </section><section className="card" id="result"><h2>Result &amp; evidence</h2>{view.result?<><p>Committed local artifact · version {view.result.version}</p><p className="digest" data-testid="result-digest">{view.result.digest}</p><pre data-testid="result-text">{view.result.text}</pre></>:<p>No committed result yet. A Plan or waiting state is separate from a result.</p>}<p>Checks: {view.checks.length?view.checks.map(c=>`${c.outcome} (${c.assurance})`).join(', '):'None recorded'}</p><p>Synthetic run units: {view.runs.reduce((sum,r)=>sum+r.syntheticUnits,0)} · real supplier cost unavailable</p><p className="muted">External delivery is not enabled. Notifications do not define task completion.</p></section></>:<section className="card empty"><h2>{identity?'Select a task or create one':'Sign in to begin'}</h2><p>Authoritative data appears after a successful local API request.</p></section>}
      <section className="card" aria-label="Connection controls"><h2>Connection &amp; delivery</h2><p data-testid="delivery">{deliveryMessage(delivery)}</p>{original.current&&<p className="digest">Original command: {original.current.commandId} · Space {original.current.spaceId}</p>}<div className="buttons"><button className="secondary" disabled={busy||!identity||!online} onClick={()=>{saveDraft();client.disconnect();setOnline(false);setNotice('Disconnected. Stop is Not delivered until explicitly sent online.');}}>Disconnect</button><button className="secondary" disabled={busy||!identity} onClick={()=>void action(reconnect)}>Reconnect (read only)</button><button className="secondary" disabled={busy||!identity||!online||!original.current} onClick={()=>void action(queryOriginal)}>Query original command</button></div></section>
    </main><footer>G1-local · no paid API · no SSH or cloud · complete G1 qualifications pending</footer>
  </div>;
}
if(typeof document!=='undefined'){const root=document.getElementById('root');if(root)createRoot(root).render(<App/>);}
