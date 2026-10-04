from lib import *
from boards_a import av, ctl, steps_html
from boards_c import tline, DF

def hdr(back, title, right=''):
    r = right or '<span style="width:60px"></span>'
    return f'<div class="row" style="height:44px;flex:none"><a style="color:var(--ac);font-weight:600;width:60px">{back}</a><span class="t3" style="flex:1;text-align:center">{title}</span>{r}</div>'
def pbody(inner, footer='', tabs=''):
    f = f'<div style="background:var(--sf);border-top:1px solid var(--ln);padding:12px 16px 34px;display:flex;flex-direction:column;gap:8px;flex:none">{footer}</div>' if footer else ''
    return f'<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:10px">{inner}</div>{f}{tabs}'
def note(text, kind='sf2'):
    return f'<div style="padding:12px 14px;border-radius:12px;background:var(--{kind});color:var(--ink2);line-height:1.45">{text}</div>'
def warn(text):
    return f'<div class="row" style="padding:12px 14px;border-radius:12px;background:var(--waitbg);align-items:flex-start"><span style="color:var(--wait)">{ic("warn")}</span><div style="color:var(--ink);line-height:1.4">{text}</div></div>'
def L(txt): return f'<div class="lbl" style="padding:2px 4px 0">{txt}</div>'

# 1. Conversations (phone) ----------------------------------------------------
def conv(title, meta, right='', on=False):
    return f'<div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:4px;{"border-color:var(--ac);background:var(--ac2)" if on else ""}"><div class="row"><span class="t3" style="flex:1">{title}</span>{right}</div><div class="sub">{meta}</div></div>'
inner = f"""
<div class="row" style="height:44px"><a href="Spaces-Phone.dc.html" style="color:var(--ac);font-weight:600">Spaces</a><span style="flex:1"></span></div>
<div><h1 class="t1" style="font-size:30px">Product</h1><div class="row" style="margin-top:6px;flex-wrap:wrap;gap:6px"><span class="chip">12 members</span><span class="chip">Computer asleep</span><span class="chip">Model: Auto</span><span class="chip">Synced now</span></div></div>
{L('Conversations in this Space')}
{conv('Launch review', '2 tasks running · 1 waiting on you', pill('run', 'Active'), True)}
{conv('Q3 interviews', 'No active tasks')}
{conv('Vendor reviews', '1 task waiting for budget', pill('wait', 'Waiting'))}
{L('Archived · 2')}
{conv('Old pricing thread', 'Archived · 1 task still running', pill('run', 'Running'))}
{note('Opening a conversation selects its Space. It never moves a running task or mounts another disk under it. Archiving hides a chat but does not stop its work.')}
"""
board('Conversations-Phone.dc.html', 'Conversations on iPhone', 390, 844, pbody(inner, tabs=phone_tabs('spaces')), direction='column')

# 2. Conversations (desktop) ---------------------------------------------------
facts = ''.join(f'<div class="card" style="flex:1;padding:12px 14px"><div class="lbl">{k}</div><div class="t3" style="margin-top:2px">{v}</div></div>' for k, v in [('Audience', 'Product, 12 members'), ('Target computer', 'Product computer'), ('Model policy', 'Auto, org approved'), ('Connection', 'Synced just now')])
body = desk_side('spaces') + f"""
<section style="width:340px;flex:none;border-right:1px solid var(--ln);padding:28px 14px 0;display:flex;flex-direction:column;gap:8px">
  <h1 class="t1" style="padding:0 6px 6px">Product</h1>
  {conv('Launch review', '2 tasks running · 1 waiting on you', pill('run', 'Active'), True)}
  {conv('Q3 interviews', 'No active tasks')}
  {conv('Vendor reviews', '1 task waiting for budget', pill('wait', 'Waiting'))}
  <div class="lbl" style="padding:10px 6px 0">Archived · 2</div>
  {conv('Old pricing thread', 'Archived · 1 task still running', pill('run', 'Running'))}
</section>
<main style="flex:1;min-width:0;padding:28px 32px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden">
  <div class="row"><h2 class="t1" style="flex:1">Launch review</h2><a href="Chat-Desktop.dc.html" class="btn pri sm">Open chat</a></div>
  <div class="sub" style="max-width:720px;line-height:1.5">Every tab, approval and queued command carries its own Space. The header always shows what this conversation is bound to.</div>
  <div class="row" style="gap:12px">{facts}</div>
  <div class="row" style="gap:16px;align-items:stretch">
    <div class="card" style="flex:1;padding:16px 18px"><div class="t2">Archive is not Stop</div><div class="sub" style="margin:4px 0 10px;line-height:1.5">Archiving hides the conversation from lists. Its 2 running tasks keep going until someone with permission stops them.</div><div class="row"><button class="btn sm">Archive conversation</button><button class="btn sm dng">Stop 2 tasks</button></div></div>
    <div class="card" style="flex:1;padding:16px 18px"><div class="t2">Continue in another Space</div><div class="sub" style="margin:4px 0 10px;line-height:1.5">A conversation stays in its recorded Space. To use another Space, copy or fork it. Nothing moves and no private mounts carry over.</div><div class="row"><button class="btn sm">Copy to a Space</button><button class="btn sm">Fork</button></div></div>
  </div>
</main>"""
board('Conversations-Desktop.dc.html', 'Conversations on Mac', 1440, 900, body)

# 3. Conflict -----------------------------------------------------------------
inner = f"""
{hdr('Back', 'Conflict')}
<div>{pill('wait', 'Needs a decision')}<h1 class="t1" style="font-size:24px;margin-top:8px">Someone updated this first</h1></div>
<div class="card" style="padding:12px 14px;line-height:1.5">Your change was based on version 40 of the Product notes. Priya saved version 41 while you worked. Yours was not applied, so nothing was overwritten.</div>
<div class="card" style="padding:4px 14px"><div class="kv"><span>Priya's version 41</span><span>"Launch moves to Thursday"</span></div><div class="kv"><span>Your change</span><span>"Launch stays on Wednesday"</span></div></div>
<div class="opt on"><span class="rd"><span></span></span><div><div class="t3">Review both</div><div class="sub" style="margin-top:2px">Compare them and decide what the notes should say.</div></div></div>
<div class="opt"><span class="rd"></span><div><div class="t3">Keep mine as a proposal</div><div class="sub" style="margin-top:2px">Saved for review. The current notes don't change.</div></div></div>
<div class="opt"><span class="rd"></span><div><div class="t3">Use Priya's version</div><div class="sub" style="margin-top:2px">Drop my change. It stays in history.</div></div></div>
"""
board('Conflict-Phone.dc.html', 'Edit conflict on iPhone', 390, 844, pbody(inner, '<button class="btn pri" style="width:100%">Review both</button>'), direction='column')

# 4. Session expired ----------------------------------------------------------
inner = f"""
{hdr('', 'Signed out')}
<div class="col" style="align-items:center;gap:12px;padding-top:24px"><span style="width:64px;height:64px;border-radius:32px;background:var(--sf2);color:var(--ink2);display:flex;align-items:center;justify-content:center">{ic('lock', 28)}</span><h1 class="t1" style="font-size:26px;text-align:center">Sign in again to continue</h1><div style="text-align:center;color:var(--ink2);line-height:1.5">Your session ended. Your work is safe on the server.</div></div>
<div class="card" style="margin-top:6px"><div class="li" style="padding:12px 14px">{tick('var(--ok)')}<span>Your tasks kept running</span></div><div class="li" style="padding:12px 14px">{tick('var(--ok)')}<span>Unsent drafts are saved on this phone</span></div><div class="li" style="padding:12px 14px"><span class="mk" style="width:18px;height:18px;border:2px solid var(--wait)"></span><span>Pending approvals need a fresh review after you sign in</span></div></div>
{note('Signing in again does not bring back expired permissions or replay old approvals.')}
"""
board('SessionExpired-Phone.dc.html', 'Session expired on iPhone', 390, 844, pbody(inner, '<button class="btn pri" style="width:100%">Sign in with your organization</button>'), direction='column')

# 5. Model picker -------------------------------------------------------------
def mod(t, s, tags, on=False):
    return f'<div class="opt{" on" if on else ""}"><span class="rd">{"<span></span>" if on else ""}</span><div style="flex:1"><div class="t3">{t}</div><div class="sub" style="margin:2px 0 6px">{s}</div><div class="row" style="flex-wrap:wrap;gap:6px">{"".join(f"<span class=chip>{x}</span>" for x in tags)}</div></div></div>'
inner = f"""
{hdr('Done', 'Model')}
{mod('Auto, organization approved', 'The workspace picks a qualified model for each step. You never need to know which.', ['Text and images', 'Org data policy'], True)}
{L('Or pick a qualified profile')}
{mod('Standard', 'Good for most work.', ['Text and images', 'Org data policy', 'Cost: Medium'])}
{mod('Deep reasoning', 'Slower, for hard problems.', ['Text', 'Org data policy', 'Cost: High'])}
<div class="col" style="gap:6px"><span class="lbl">Quality and speed</span><div class="seg"><span>Fast</span><span class="on">Balanced</span><span>Thorough</span></div><div class="sub">This is a preference. It is not a permission level.</div></div>
{note('If a pinned model is unavailable, the task waits and says so, unless policy allows an equivalent.')}
"""
board('ModelPicker-Phone.dc.html', 'Model choice on iPhone', 390, 844, pbody(inner), direction='column')

# 6. Task envelope ------------------------------------------------------------
def env(kind, title, items):
    pk = {'ok': ('ok', 'Without asking'), 'wait': ('wait', 'Asks first'), 'bad': ('bad', 'Blocked')}[kind]
    rows = ''.join(f'<div class="li">{"" }<span>{i}</span></div>' for i in items)
    return f'<div class="card" style="padding:10px 14px"><div class="row">{pill(*pk)}<span class="t3">{title}</span></div><div style="margin-top:4px">{rows}</div></div>'
inner = f"""
{hdr('Task', 'Task envelope')}
<div class="sub" style="padding:0 4px;line-height:1.45">What "Launch dashboard" may do, set when the task started. It replaces repeated permission pop-ups.</div>
{env('ok', 'Inside the envelope', ['Edit the task draft', 'Run approved local tests'])}
{env('wait', 'Needs your approval', ['Publish outside Product', 'Send to an external service'])}
{env('bad', 'Not allowed', ['Unknown high-impact actions', 'Anything outside Product files'])}
<div class="card" style="padding:4px 14px"><div class="kv"><span>Audience</span><span>Product, 12 members</span></div><div class="kv"><span>Cost ceiling</span><span>Up to $15.00</span></div><div class="kv"><span>Must pass</span><span>Build, sizes, keyboard</span></div></div>
{note('Inside the envelope does not mean unchecked. Every action still passes the broker and is judged by what it actually does.')}
"""
board('Envelope-Phone.dc.html', 'Task envelope on iPhone', 390, 844, pbody(inner), direction='column')

# 7. Computer startup + queue -------------------------------------------------
inner = f"""
{hdr('Task', 'Computer')}
<div><span class="pill p-run"><i></i>Preparing computer</span><h1 class="t2" style="font-size:20px;margin-top:8px">Mounting storage</h1><div class="sub">This task needs files, so the Product computer is waking up.</div></div>
{tline([('ok', 'Task admitted', 'Needs a computer'), ('ok', 'Image and policy checked', 'Current access confirmed'), ('wait', 'Mounting storage', 'Product files only'), ('idle', 'Starting task identity', 'Not started'), ('idle', 'Ready', 'Nothing runs until it is ready')])}
<div class="card" style="padding:12px 14px"><div class="row">{pill('wait', 'Queued')}<span class="t3">Package install</span></div><div class="sub" style="margin-top:4px;line-height:1.45">Waiting for "Fix flaky export test", which is installing packages. Owner: Ana. Reason: only one install at a time.</div></div>
{note('If setup fails you can retry setup, choose a qualified profile, or contact your administrator.')}
"""
board('Startup-Phone.dc.html', 'Computer startup on iPhone', 390, 844, pbody(inner, '<button class="btn" style="width:100%">Stop this task</button>'), direction='column')

# 8. Runtime qualification (admin) --------------------------------------------
def rt(c, claim, ev, state, sk):
    return f'<div class="tr" style="grid-template-columns:1.3fr 1.5fr 1.2fr 1fr"><span class="t3">{c}</span><span>{claim}</span><span class="sub">{ev}</span><span>{pill(sk, state)}</span></div>'
body = desk_side('shield') + f"""
<main style="flex:1;min-width:0;padding:28px 36px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden">
  <div class="row"><h1 class="t1" style="flex:1">Runtime qualification</h1>{pill('idle', 'Software-only assurance')}<span class="chip">Administrator</span></div>
  <div class="sub" style="max-width:820px;line-height:1.5">What each control claims, the evidence behind it and when it was last verified. A claim is shown only when a deployment record backs it.</div>
  <div class="row" style="gap:20px;align-items:flex-start">
    <section class="card" style="flex:1.7;overflow:hidden"><div class="tr th" style="grid-template-columns:1.3fr 1.5fr 1.2fr 1fr"><span>Control</span><span>Claim</span><span>Evidence</span><span>State</span></div>
      {rt('Network policy', 'Outbound allow list only', 'Verified on current generation', 'Active', 'ok')}
      {rt('Process isolation', 'Per-run identity and scratch', 'Verified on current generation', 'Active', 'ok')}
      {rt('Filesystem restriction', 'Space files only', 'Stronger boundary needs a new runtime', 'Pending recreation', 'wait')}
      {rt('Hardware watchdog', 'Out-of-band monitoring', 'No deployment record', 'Not deployed', 'idle')}
    </section>
    <section class="col" style="flex:1;gap:14px">
      <div class="card" style="padding:14px 16px"><div class="t2">What people see</div><div class="sub" style="margin:4px 0 8px;line-height:1.5">A clear policy profile, and any limit that affects the work they asked for.</div><div class="row" style="padding:10px 12px;border-radius:8px;background:var(--waitbg);align-items:flex-start"><span style="color:var(--wait)">{ic('warn')}</span><div style="line-height:1.4">A stronger file boundary is waiting for a new computer. Until then this Space uses the standard boundary.</div></div></div>
      <div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:6px"><div class="t3">Limits we state plainly</div><div class="sub" style="line-height:1.5">An allowed destination does not prove the data sent there is safe. Isolation does not recall exported data or undo an approved payment.</div></div>
      <div class="row"><button class="btn pri sm">Recreate computer</button><button class="btn sm">View deployment record</button></div>
    </section>
  </div>
</main>"""
board('Runtime-Desktop.dc.html', 'Runtime qualification on Mac', 1440, 900, body)

# 9. Revocation ---------------------------------------------------------------
def rv(t, s, pk, pt):
    return f'<div class="tr" style="grid-template-columns:1.3fr 2fr 1fr"><span class="t3">{t}</span><span class="sub">{s}</span><span>{pill(pk, pt)}</span></div>'
body = desk_side('spaces') + f"""
<main style="flex:1;min-width:0;padding:28px 36px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden">
  <div class="sub">Spaces / Product / Members</div>
  <div class="row"><h1 class="t1" style="flex:1">Remove Dev from Product</h1>{pill('wait', 'Review impact')}</div>
  <div class="row" style="gap:20px;align-items:flex-start">
    <section class="card" style="flex:1.5;overflow:hidden"><div style="padding:14px 16px 0" class="t2">What changes right away</div><div class="tr th" style="grid-template-columns:1.3fr 2fr 1fr"><span>Area</span><span>Effect</span><span>Status</span></div>
      {rv('Access caches', 'Product chat, files and search stop returning results to Dev', 'ok', 'Revoked')}
      {rv('Shared links', 'Links Dev created stop working', 'ok', 'Revoked')}
      {rv('Live streams', 'Open computer views end', 'ok', 'Ended')}
      {rv('Tasks Dev owns', 'Reassign or stop before removal completes', 'wait', 'Needs you')}
    </section>
    <section class="col" style="flex:1;gap:14px">
      <div class="card" style="padding:14px 16px"><div class="t2">How files are delivered</div><div class="opt on" style="margin-top:10px"><span class="rd"><span></span></span><div><div class="t3">Checked on every read</div><div class="sub">Access is rechecked each time, so removal takes effect now.</div></div></div><div class="opt" style="margin-top:8px"><span class="rd"></span><div><div class="t3">Short-lived direct link</div><div class="sub">Faster, but a link already issued keeps working until it expires. The window is shown.</div></div></div></div>
      {'<div class="row" style="padding:12px 14px;border-radius:12px;background:var(--sf2);color:var(--ink2);align-items:flex-start">' + ic('eye') + '<div style="line-height:1.45">Bytes Dev already downloaded cannot be recalled. Removal stops new access, not copies already made.</div></div>'}
      <div class="row"><button class="btn pri sm">Remove and revoke</button><button class="btn sm">Cancel</button></div>
    </section>
  </div>
</main>"""
board('Revoke-Desktop.dc.html', 'Remove member on Mac', 1440, 900, body)

# 10. Memory review -----------------------------------------------------------
inner = f"""
{hdr('Back', 'Suggested memory')}
<div>{pill('wait', 'Pending review')}</div>
<div class="card" style="padding:16px"><div class="lbl">The agent suggests remembering</div><div style="font-size:19px;font-weight:600;margin-top:6px;line-height:1.3">Maya prefers a weekly summary on Fridays</div></div>
<div class="card" style="padding:4px 14px"><div class="kv"><span>Came from</span><span>Product chat</span></div><div class="kv"><span>Suggested by</span><span>The agent</span></div></div>
<div class="col" style="gap:6px"><span class="lbl">What kind of fact is it</span><div class="seg"><span class="on">Preference</span><span>Someone's claim</span><span>Observed</span></div></div>
<div class="col" style="gap:6px"><span class="lbl">Where it applies</span><div class="seg"><span class="on">Only me</span><span>This Space</span></div></div>
{note('It is not used in any task until you accept it. Accepting shares nothing outside the scope you choose.')}
"""
board('MemoryReview-Phone.dc.html', 'Memory review on iPhone', 390, 844, pbody(inner, '<button class="btn pri" style="width:100%">Accept</button><div class="row"><button class="btn" style="flex:1">Edit</button><button class="btn" style="flex:1">Not now</button></div>'), direction='column')

# 11. Sensitive session -------------------------------------------------------
inner = f"""
{hdr('Cancel', 'Private step')}
<div><h1 class="t1" style="font-size:24px">Sign in to Salesforce yourself</h1><div class="sub" style="margin-top:4px;line-height:1.45">The agent can't do this for you. While you sign in it is paused and can't see or touch the session.</div></div>
<div class="card"><div class="li" style="padding:12px 14px">{tick('var(--ok)')}<span>Agent view paused</span></div><div class="li" style="padding:12px 14px">{tick('var(--ok)')}<span>Agent input paused</span></div><div class="li" style="padding:12px 14px">{tick('var(--ok)')}<span>Recording paused</span></div><div class="li" style="padding:12px 14px">{tick('var(--ok)')}<span>Clipboard and cookies out of reach of other processes</span></div></div>
{note('You are working in the remote workspace, not on this phone. Your phone is not shared with the agent.')}
{note('After you finish, the task stays paused. You choose when it resumes, and it re-checks the screen first.')}
"""
board('Sensitive-Phone.dc.html', 'Private sign-in on iPhone', 390, 844, pbody(inner, '<button class="btn pri" style="width:100%">Continue to sign in</button><button class="btn" style="width:100%">Cancel and keep the task paused</button>'), direction='column')

# 12. Rollout and rollback ----------------------------------------------------
def stg(n, t, s, state):
    cls = {'done': 'ok', 'cur': 'run', 'next': 'idle'}[state]
    txt = {'done': 'Done', 'cur': 'Current', 'next': 'Next'}[state]
    return f'<div class="card" style="flex:1;padding:12px 14px;{"border-color:var(--ac);background:var(--ac2)" if state == "cur" else ""}"><div class="row"><span class="n">{n}</span>{pill(cls, txt)}</div><div class="t3" style="margin-top:6px">{t}</div><div class="sub">{s}</div></div>'
body = desk_side('methods') + f"""
<main style="flex:1;min-width:0;padding:28px 36px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden">
  <div class="row"><h1 class="t1" style="flex:1">Rollout: add a source check</h1>{pill('bad', 'Regression found')}</div>
  <div class="row" style="gap:12px">{stg(1, 'Candidate', 'Tested on fixtures', 'done')}{stg(2, 'Small cohort', 'Consenting members', 'cur')}{stg(3, 'Wider release', 'Product Space', 'next')}{stg(4, 'Active', 'Replaces version 3', 'next')}</div>
  <div class="row" style="padding:14px 16px;border-radius:12px;background:var(--badbg);align-items:flex-start"><span style="color:var(--bad)">{ic('warn')}</span><div style="color:var(--ink);line-height:1.45"><b>A safety check regressed in the cohort.</b> New runs go back to version 3 now. 2 active runs still use this method.</div></div>
  <div class="row" style="gap:20px;align-items:flex-start">
    <section class="card" style="flex:1;padding:14px 18px"><div class="t2" style="margin-bottom:4px">Active runs using it</div><div class="sub" style="margin-bottom:8px;line-height:1.5">A quality regression can pause at a safe step. A security defect stops continuation immediately.</div><div class="row"><button class="btn pri sm">Pause at safe boundary</button><button class="btn sm">Let them finish</button></div></section>
    <section class="card" style="flex:1;padding:6px 18px"><div class="kv"><span>Candidate</span><span class="mono">digest 4be1…77a0</span></div><div class="kv"><span>Approver</span><span>Priya</span></div><div class="kv"><span>Scope</span><span>Small cohort only</span></div><div class="kv"><span>Prior version</span><span>Version 3, kept</span></div><div class="kv"><span>Expires</span><span>Requalify after model changes</span></div></section>
  </div>
  <div class="sub">Rolling back changes which version future runs use. It does not undo anything a run already did outside Agent Fabric.</div>
</main>"""
board('Rollout-Desktop.dc.html', 'Rollout and rollback on Mac', 1440, 900, body)

# 13. Export ------------------------------------------------------------------
inner = f"""
{hdr('Cancel', 'Share result')}
<div><div class="lbl">Result</div><div class="t2" style="margin-top:2px">Launch dashboard, version 4</div></div>
<div class="opt on"><span class="rd"><span></span></span><div><div class="t3">Live reference</div><div class="sub" style="margin-top:2px;line-height:1.4">People open the real result. If their access is removed, it stops working for them.</div></div></div>
<div class="opt"><span class="rd"></span><div><div class="t3">Published copy</div><div class="sub" style="margin-top:2px;line-height:1.4">A separate copy that lives on its own. Needs your rights, a destination, a retention period and its provenance.</div></div></div>
<div class="card" style="padding:12px 14px"><div class="lbl">Never included</div><div class="sub" style="margin-top:4px;line-height:1.5">Secrets, hidden reasoning, and the titles of private sources. Importing it elsewhere does not give access to the originals.</div></div>
{warn('A copy cannot be recalled after someone downloads it.')}
"""
board('Export-Phone.dc.html', 'Share a result on iPhone', 390, 844, pbody(inner, '<button class="btn pri" style="width:100%">Share live reference</button><button class="btn" style="width:100%">Review published copy</button>'), direction='column')

# 14. Recovery ----------------------------------------------------------------
inner = f"""
{hdr('', 'Back online')}
<div>{pill('ok', 'Reconnected')}<h1 class="t1" style="font-size:24px;margin-top:8px">Here's where things stand</h1></div>
<div class="card"><div class="li" style="padding:12px 14px">{tick('var(--ok)')}<span>Task restored to its last confirmed state</span></div><div class="li" style="padding:12px 14px">{tick('var(--ok)')}<span>Your files and results were preserved</span></div></div>
<div class="card" style="padding:12px 14px"><div class="row">{pill('wait', 'Outcome unknown')}<span class="t3">Posted to #launch</span></div><div class="sub" style="margin-top:4px;line-height:1.45">We sent it just before the outage and never got confirmation. We won't send it again on our own.</div></div>
<div class="card" style="padding:12px 14px"><div class="row">{pill('idle', 'Not sent')}<span class="t3">Draft message to Product</span></div><div class="sub" style="margin-top:4px">Kept as a draft. It sends only if you tap Send.</div></div>
{note('Approvals from before the outage are not replayed. Anything waiting on you needs a fresh review.')}
"""
board('Recovery-Phone.dc.html', 'Recovery on iPhone', 390, 844, pbody(inner, '<button class="btn pri" style="width:100%">Check status of #launch post</button><a href="Inbox-Phone.dc.html" class="btn" style="width:100%">Open Inbox</a>'), direction='column')

# 15. Delete Space review -----------------------------------------------------
def dstep(i, t, s, st):
    mk = {'done': f'<span class="mk" style="width:24px;height:24px;background:var(--ok);color:#fff">{ic("check", 13, 3)}</span>', 'cur': '<span class="mk" style="width:24px;height:24px;border:3px solid var(--ac);background:var(--ac2)"></span>', 'next': '<span class="mk" style="width:24px;height:24px;border:2px dashed var(--ink3)"></span>'}[st]
    bg = 'background:var(--ac2)' if st == 'cur' else ''
    return f'<div class="row" style="gap:14px;padding:14px 16px;border-top:1px solid var(--ln);{bg}"><span class="mono" style="width:16px;color:var(--ink3)">{i}</span>{mk}<div style="flex:1"><div class="t3">{t}</div><div class="sub">{s}</div></div></div>'
body = desk_side('spaces') + f"""
<main style="flex:1;min-width:0;padding:28px 36px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden">
  <div class="sub">Spaces / Research / Lifecycle</div>
  <div class="row"><h1 class="t1" style="flex:1">Delete Research</h1>{pill('run', 'Review in progress')}</div>
  <div class="sub" style="max-width:780px;line-height:1.5">Deleting a Space is a reviewed process, not a single button. Nothing is deleted until the last step, and you can stop at any point before it.</div>
  <div class="row" style="gap:20px;align-items:flex-start">
    <section class="card" style="flex:1.5;overflow:hidden">{dstep(1, 'Stop admitting new tasks', 'No new work can start in this Space', 'done').replace('border-top:1px solid var(--ln);', '')}{dstep(2, 'Revoke grants', 'Members, connections and links', 'done')}{dstep(3, 'Drain or fence workers', 'Waiting for 1 running task to reach a safe point', 'cur')}{dstep(4, 'Settle unknown actions', 'Check anything sent outside whose result is unclear', 'next')}{dstep(5, 'Apply retention and deletion policy', 'Held data follows legal-hold and backup rules', 'next')}</section>
    <section class="col" style="flex:1;gap:14px">
      <div class="card" style="padding:14px 16px"><div class="t2">Impact report</div><div class="li" style="margin-top:4px">{pill('run', 'Draining')}<span>1 running task: Vendor interview synthesis</span></div><div class="li">{pill('wait', 'Unknown')}<span>1 action to settle: email to vendor</span></div><div class="li">{pill('idle', 'Kept')}<span>Results others exported stay with them</span></div></div>
      <div class="sub" style="line-height:1.5">Backups are not erased at once. Their retention follows your organization's rules, and deletion is applied again before anything is restored.</div>
      <div class="row"><button class="btn pri sm">Continue review</button><button class="btn sm">Pause</button><button class="btn dng sm">Cancel deletion</button></div>
    </section>
  </div>
</main>"""
board('DeleteSpace-Desktop.dc.html', 'Delete a Space on Mac', 1440, 900, body)
print('E done')
