from lib import *

def av(t, s=28):
    return f'<span class="mk" style="width:{s}px;height:{s}px;background:var(--ac2);color:var(--acd);font-size:12px;font-weight:700">{t}</span>'

def sp_card(name, sub, pillk, pilltxt, on=False, chips=''):
    st = 'border-color:var(--ac);background:var(--ac2)' if on else ''
    return f'<div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:6px;{st}"><div class="row"><span class="t2" style="flex:1">{name}</span>{pill(pillk, pilltxt)}</div><div class="sub">{sub}</div>{chips}</div>'

# ============ TABLET ============
body = rail('spaces') + f"""
<section style="width:300px;flex:none;border-right:1px solid var(--ln);padding:32px 16px 0;display:flex;flex-direction:column;gap:10px">
  <h1 class="t1" style="font-size:30px;padding:0 2px">Spaces</h1>
  <div class="card row" style="height:44px;padding:0 14px;color:var(--ink3)">{ic('search')}Search Spaces</div>
  {sp_card('Product', 'Shared · 12 members', 'ok', 'Awake', True)}
  {sp_card('Personal', 'Private to you', 'idle', 'Asleep')}
  {sp_card('Research', 'Shared · 5 members', 'idle', 'Asleep')}
  {sp_card('Platform ops', 'Shared · 7 members', 'wait', 'No signal')}
</section>
<main style="flex:1;min-width:0;padding:32px 28px 0;display:flex;flex-direction:column;gap:14px">
  <div class="row"><h2 class="t1" style="font-size:26px;flex:1">Product</h2>{pill('ok', 'Computer awake')}</div>
  <div class="row"><span class="chip">Shared · 12 members</span><span class="chip">2 running</span><span class="chip on">1 waiting on you</span></div>
  <div class="card" style="padding:6px 16px"><div class="kv"><span>Storage</span><span>Product files</span></div><div class="kv"><span>Memory namespace</span><span class="mono">product</span></div><div class="kv"><span>Default computer</span><span>Product computer</span></div><div class="kv"><span>Model route</span><span>Workspace default</span></div></div>
  <div class="card" style="padding:14px 16px"><div class="lbl">Members</div><div class="row" style="margin-top:8px">{av('PR')}{av('MA')}{av('LE')}{av('DE')}<span class="sub">and 8 more</span></div></div>
  <div class="sub">Opening a Space changes what you see. It never moves a running task or mounts another Space's disk under it.</div>
  <div class="row"><a href="Chat-Tablet.dc.html" class="btn pri">Open chat</a><button class="btn">Space settings</button></div>
</main>
"""
board('Spaces-Tablet.dc.html', 'Spaces on iPad', 834, 1112, body)

steps = ['Read requirements and the three findings', 'Draft the dashboard layout', 'Run checks on the draft', 'Prepare it for review. You decide on delivery.']
steps_html = ''.join(f'<div class="li"><span class="n">{i+1}</span><span>{s}</span></div>' for i, s in enumerate(steps))
assump = ''.join(f'<div class="li"><span class="sub">·</span><span>{s}</span></div>' for s in ['Data comes from the files in Product.', 'Only Product members will see it.', 'No external publishing is part of this plan.'])
body = rail('spaces') + f"""
<main style="flex:1;min-width:0;padding:32px 36px 0;display:flex;flex-direction:column;gap:14px">
  <div class="sub">Product / Space chat</div>
  <div class="row"><h1 class="t1" style="font-size:28px;flex:1">Plan: launch dashboard</h1><span class="chip">Version 2</span></div>
  <div class="seg" style="width:260px"><span>Ask</span><span class="on">Plan</span><span>Act</span></div>
  <div class="card" style="padding:14px 18px"><span class="lbl">Assumptions</span><div style="margin-top:4px">{assump}</div></div>
  <div class="card" style="padding:14px 18px"><span class="lbl">Steps</span><div style="margin-top:4px">{steps_html}</div></div>
  <div class="row" style="align-items:stretch;gap:14px">
    <div class="card" style="flex:1;padding:14px 18px"><div class="lbl">Resources</div><div class="sub" style="margin-top:4px;line-height:1.5">Product files · Product computer · GitHub, read only</div></div>
    <div class="card" style="flex:1;padding:14px 18px;background:var(--sf2)"><div class="lbl">Estimated cost</div><div style="margin-top:4px;line-height:1.5"><b>Not estimated yet.</b> It appears on the task card before anything runs.</div></div>
  </div>
  <span style="flex:1"></span>
  <div style="border-top:1px solid var(--ln);padding:14px 0 28px;display:flex;gap:10px;align-items:center"><button class="btn pri">Start as task (Act)</button><button class="btn">Revise plan</button><span style="flex:1"></span><span class="sub">Nothing runs until you confirm the preflight card.</span></div>
</main>
"""
board('Plan-Tablet.dc.html', 'Plan on iPad', 834, 1112, body)

def ctl(t, s, on=None, val=None):
    right = f'<span class="val">{val}</span>' if val else f'<span class="tg{" on" if on else ""}" role="switch" aria-checked="{"true" if on else "false"}" aria-label="{t}"></span>'
    return f'<div class="ctl"><div style="flex:1"><div class="t3">{t}</div><div class="sub">{s}</div></div>{right}</div>'

body = rail('settings') + f"""
<main style="flex:1;min-width:0;padding:32px 40px 0;display:flex;flex-direction:column;gap:10px">
  <h1 class="t1" style="font-size:32px">Settings</h1>
  <div style="max-width:600px;display:flex;flex-direction:column;gap:10px">
    <div class="lbl" style="padding:8px 4px 0">Privacy on this iPad</div>
    <div class="card">{ctl('Hide details on the lock screen', 'Notifications say "Needs you", not what for', True)}{ctl('Face ID for approvals', 'Required before you approve an action', True)}{ctl('Confirm voice transcripts', 'Review the text before it is sent', True)}</div>
    <div class="lbl" style="padding:12px 4px 0">Work</div>
    <div class="card">{ctl('Keep drafts when offline', 'Saved on this iPad, sent only when you tap Send', True)}{ctl('Run a local worker on this iPad', 'Off. Tablets do not run local workers.', False)}{ctl('Model', 'Chosen for you by your workspace', val='Auto')}</div>
    <div class="lbl" style="padding:12px 4px 0">Layout</div>
    <div class="card">{ctl('Show the sidebar in portrait', 'On iPad portrait the sidebar can collapse to icons', True)}</div>
  </div>
</main>
"""
board('Settings-Tablet.dc.html', 'Settings on iPad', 834, 1112, body)

body = rail('home') + f"""
<main style="flex:1;min-width:0;padding:32px 36px 0;display:flex;flex-direction:column;gap:14px">
  <div class="row" style="padding:12px 16px;border-radius:12px;background:var(--idlebg)">{ic('wifioff')}<div style="line-height:1.35"><b>You're offline.</b> What you see may be out of date.</div></div>
  <h1 class="t1" style="font-size:30px">Home</h1>
  <div class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:8px">
    <div class="row"><span class="t3" style="flex:1">Vendor SOC 2 summary</span>{pill('run', 'Running (last seen)')}</div>
    <div class="sub">This view was loaded before you went offline. The task may have moved on.</div>
    <div class="row" style="padding:10px 12px;border-radius:10px;background:var(--waitbg)"><div style="flex:1;line-height:1.35"><b>Stop</b> <span style="color:var(--ink2)">will send when you're back online</span></div>{pill('wait', 'Not delivered')}</div>
    <div class="sub">If the task finishes first, the Stop has no effect.</div>
  </div>
  <div class="row" style="align-items:stretch;gap:14px">
    <div class="card" style="flex:1;padding:16px 18px;display:flex;flex-direction:column;gap:6px"><div class="row"><span class="t3" style="flex:1">Message to Product chat</span>{pill('idle', 'Draft not sent')}</div><div class="sub">Saved on this iPad. It sends only when you tap Send after reconnecting.</div></div>
    <div class="card" style="flex:1;padding:16px 18px;display:flex;flex-direction:column;gap:8px"><div class="row"><span class="t3" style="flex:1">Make launch preview public</span>{pill('wait', 'Approval')}</div><div class="sub">Sensitive approvals can't be queued offline. Reconnect to decide.</div><button class="btn dis" aria-disabled="true">Approve</button></div>
  </div>
</main>
"""
board('Offline-Tablet.dc.html', 'Offline and stale on iPad', 834, 1112, body)

screen = """<div style="flex:1;border-radius:12px;background:#0E1620;border:1px solid var(--ln);overflow:hidden;display:flex;flex-direction:column">
  <div style="height:34px;background:#1B2733;display:flex;align-items:center;gap:6px;padding:0 12px"><span style="width:10px;height:10px;border-radius:5px;background:#3A4856"></span><span style="width:10px;height:10px;border-radius:5px;background:#3A4856"></span><span style="width:10px;height:10px;border-radius:5px;background:#3A4856"></span><span style="margin-left:10px;height:18px;width:260px;border-radius:5px;background:#0E1620"></span></div>
  <div style="flex:1;padding:24px;display:flex;gap:18px"><div style="width:180px;display:flex;flex-direction:column;gap:10px"><span style="height:14px;border-radius:4px;background:#26323F"></span><span style="height:14px;width:70%;border-radius:4px;background:#26323F"></span><span style="height:14px;width:85%;border-radius:4px;background:#26323F"></span><span style="height:14px;width:55%;border-radius:4px;background:#26323F"></span></div>
  <div style="flex:1;display:flex;flex-direction:column;gap:14px"><span style="height:26px;width:40%;border-radius:5px;background:#2F3E4E"></span><div style="display:flex;gap:14px"><span style="flex:1;height:110px;border-radius:8px;background:#1F2C39"></span><span style="flex:1;height:110px;border-radius:8px;background:#1F2C39"></span><span style="flex:1;height:110px;border-radius:8px;background:#1F2C39"></span></div><span style="height:150px;border-radius:8px;background:#1F2C39"></span></div></div>
</div>"""
body = rail('spaces') + f"""
<main style="flex:1;min-width:0;padding:32px 28px 28px;display:flex;flex-direction:column;gap:14px">
  <div class="row"><h1 class="t1" style="font-size:26px;flex:1">Product computer</h1>{pill('ok', 'Awake')}<span class="chip">Live view</span></div>
  {screen}
</main>
<aside style="width:340px;flex:none;border-left:1px solid var(--ln);padding:32px 20px 28px;display:flex;flex-direction:column;gap:12px">
  <div class="card" style="padding:14px 16px"><div class="lbl">Agent is working on</div><div class="t3" style="margin-top:4px">Drafting the dashboard layout</div><div class="sub">Task: Launch dashboard</div></div>
  <div class="card" style="padding:14px 16px"><div class="lbl">Control</div><div class="t3" style="margin-top:4px">The agent has control</div><div class="sub" style="margin-top:2px;line-height:1.5">Taking over pauses the agent's input. You hold a lease that ends when you hand it back.</div><button class="btn pri" style="width:100%;margin-top:10px">Take over</button></div>
  <div class="card" style="padding:14px 16px"><div class="lbl">Watching</div><div class="row" style="margin-top:8px">{av('PR')}{av('MA')}<span class="sub">2 people can see this view</span></div></div>
  <span style="flex:1"></span>
  <button class="btn dng">Stop task</button>
</aside>
"""
board('Computer-Tablet.dc.html', 'Computer on iPad', 1194, 834, body)

# ============ ANDROID ============
def a_bar(title, back=True):
    bk = '<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">' + ic('back', 24) + '</span>' if back else ''
    pad = '' if back else 'padding-left:12px'
    return '<div class="row" style="height:56px;padding:0 4px">' + bk + '<span style="font-size:22px;font-weight:600;flex:1;' + pad + '">' + title + '</span></div>'

body = f"""
<div style="flex:1;overflow:hidden;padding:36px 16px 0;display:flex;flex-direction:column;gap:12px">
  {a_bar('Approval')}
  <div class="row">{pill('wait', 'Approval needed')}<span class="sub">Dashboard prototype · Priya · Product</span></div>
  <h1 style="margin:0;font-size:26px;font-weight:600;line-height:1.2">Make launch preview public</h1>
  <div class="card" style="padding:6px 16px">
    <div class="kv"><span>Action</span><span>Publish the preview page</span></div>
    <div class="kv"><span>Who can see it</span><span>Anyone with the link</span></div>
    <div class="kv"><span>Bound to</span><span class="mono">digest 7f3a…c9d1</span></div>
    <div class="kv"><span>Valid until</span><span>It changes or times out</span></div>
  </div>
  <div class="row" style="padding:14px 16px;border-radius:16px;background:var(--waitbg);align-items:flex-start;color:var(--wait)">{ic('warn', 24)}<div style="color:var(--ink);line-height:1.45">Approving covers this exact version only. If the page changes, you will be asked again.</div></div>
  <div class="card" style="padding:12px 16px"><div class="lbl">If you decline</div><div class="sub" style="margin-top:4px;line-height:1.5">Nothing is published. Priya is told, and the task keeps the draft so it can be changed and asked again.</div></div>
  <div class="row sub">{ic('lock', 20)}Fingerprint required to approve</div>
</div>
<div style="padding:12px 16px 28px;display:flex;flex-direction:column;gap:8px;flex:none">
  <button class="btn pri" style="width:100%">Approve</button>
  <div class="row"><button class="btn" style="flex:1">Decline</button><button class="btn ghost" style="flex:1;color:var(--ac)">Ask a question</button></div>
</div>
"""
board('Approval-Android.dc.html', 'Approval on Android phone', 412, 892, body, AND_CSS, FONT_AND, r=16, rb=24, direction='column')

body = f"""
<div style="flex:1;overflow:hidden;padding:36px 16px 0;display:flex;flex-direction:column;gap:10px">
  {a_bar('Plan')}
  <div class="seg" style="border-radius:20px"><span style="border-radius:18px">Ask</span><span class="on" style="border-radius:18px">Plan</span><span style="border-radius:18px">Act</span></div>
  <div class="card" style="padding:12px 16px"><span class="lbl">Goal</span><div class="t2" style="margin-top:2px">Launch dashboard for the Q3 review</div></div>
  <div class="card" style="padding:12px 16px"><span class="lbl">Steps</span><div style="margin-top:4px">{steps_html}</div></div>
  <div class="card" style="padding:12px 16px"><span class="lbl">Resources</span><div class="sub" style="margin-top:2px">Product files · Product computer · GitHub, read only</div></div>
  <div style="padding:12px 16px;border-radius:16px;background:var(--sf2);color:var(--ink2)"><b>Cost not estimated yet.</b> An estimate appears before anything runs.</div>
</div>
<div style="padding:12px 16px 28px;display:flex;flex-direction:column;gap:8px;flex:none">
  <button class="btn pri" style="width:100%">Start as task (Act)</button>
  <button class="btn" style="width:100%">Revise plan</button>
</div>
"""
board('Plan-Android.dc.html', 'Plan on Android phone', 412, 892, body, AND_CSS, FONT_AND, r=16, rb=24, direction='column')

body = f"""
<div style="flex:1;overflow:hidden;padding:36px 16px 0;display:flex;flex-direction:column;gap:10px">
  <h1 style="margin:0;font-size:32px;font-weight:600;padding:12px 4px 8px">Settings</h1>
  <div class="lbl" style="padding:0 4px">Privacy on this phone</div>
  <div class="card">{ctl('Hide details on lock screen', 'Notifications say "Needs you"', True)}{ctl('Fingerprint for approvals', 'Required before you approve', True)}{ctl('Confirm voice transcripts', 'Review text before it is sent', True)}</div>
  <div class="lbl" style="padding:8px 4px 0">Work</div>
  <div class="card">{ctl('Keep drafts when offline', 'Saved on this phone', True)}{ctl('Run a local worker', 'Off. Phones do not run workers.', False)}{ctl('Model', 'Chosen by your workspace', val='Auto')}</div>
</div>
""" + android_nav('home')
board('Settings-Android.dc.html', 'Settings on Android phone', 412, 892, body, AND_CSS, FONT_AND, r=16, rb=24, direction='column')

# ============ WINDOWS ============
def win_frame(title, content, on='device'):
    return f"""
<div class="row" style="height:32px;flex:none;padding-left:12px;gap:10px;font-size:12px"><span style="width:16px;height:16px;border-radius:4px;background:var(--ac);color:var(--onac);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">A</span><span>{title}</span>{CAPTION}</div>
<div style="flex:1;display:flex;min-height:0">
{win_nav(on)}
<main style="flex:1;min-width:0;background:var(--sf);border:1px solid var(--ln);border-bottom:0;border-right:0;border-radius:8px 0 0 0;padding:28px 36px 0;display:flex;flex-direction:column;gap:16px;overflow:hidden">{content}</main>
</div>"""

devices = f"""
<div class="row"><h1 class="t1" style="font-weight:600;flex:1">Devices and local workers</h1><button class="btn pri">Enroll a local worker</button></div>
<div class="row" style="align-items:flex-start;gap:20px">
  <section class="col" style="flex:1.4;gap:16px">
    <div class="card" style="overflow:hidden"><div style="padding:14px 16px 0" class="t2">Signed-in sessions</div>
      <div class="tr th" style="grid-template-columns:1.4fr 1fr 1fr 100px"><span>Device</span><span>Platform</span><span>Status</span><span></span></div>
      <div class="tr" style="grid-template-columns:1.4fr 1fr 1fr 100px"><span class="t3">This PC</span><span>Windows</span><span>{pill('ok', 'This session')}</span><span></span></div>
      <div class="tr" style="grid-template-columns:1.4fr 1fr 1fr 100px"><span class="t3">iPhone</span><span>iOS</span><span>{pill('ok', 'Active')}</span><span><button class="btn">Sign out</button></span></div>
      <div class="tr" style="grid-template-columns:1.4fr 1fr 1fr 100px"><span class="t3">MacBook</span><span>macOS</span><span>{pill('idle', 'Inactive')}</span><span><button class="btn">Sign out</button></span></div>
    </div>
    <div class="card" style="overflow:hidden"><div style="padding:14px 16px 0" class="t2">Local workers</div>
      <div class="tr th" style="grid-template-columns:1.4fr 1.4fr 1fr 100px"><span>Worker</span><span>Assurance</span><span>Status</span><span></span></div>
      <div class="tr" style="grid-template-columns:1.4fr 1.4fr 1fr 100px"><span class="t3">This PC, Documents folder</span><span>Software-only</span><span>{pill('ok', 'Enrolled')}</span><span><button class="btn dng">Revoke</button></span></div>
    </div>
  </section>
  <section class="card" style="flex:1;padding:16px 18px">
    <div class="t2">Enroll a local worker</div>
    <div class="sub" style="margin:4px 0 8px;line-height:1.5">Each permission is separate. Windows Hello confirms you before enrolling.</div>
    {ctl('Read files in chosen folders', 'Only folders you pick', True)}{ctl('Create and change files', 'Off. Each change would ask first.', False)}{ctl('Run commands', 'Off. Needs your approval per task.', False)}{ctl('Use screen and keyboard', 'Off. Takeover stays visible.', False)}
    <div class="row" style="margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--sf2);color:var(--ink2);font-size:13px;line-height:1.45;align-items:flex-start">{ic('lock', 18)}<div><b>Assurance: software-only.</b> Enforced by the worker app on this PC. It is not a sandbox against a compromised computer.</div></div>
    <div class="row" style="margin-top:12px"><button class="btn pri">Enroll with 1 permission</button><button class="btn">Cancel</button></div>
  </section>
</div>
"""
board('Devices-Windows.dc.html', 'Devices on Windows', 1440, 900, win_frame('Devices - Agent Fabric', devices), WIN_CSS, FONT_WIN, r=8, rb=4, direction='column')

def gcell(t, k):
    return f'<span style="font-weight:600;color:var(--{k})">{t}</span>'
Y, A, N = 'ok', 'wait', 'ink3'
rows = [('Files', [('Allowed', Y)] * 3 + [('Read only', Y)]),
        ('Network', [('Allowed', Y), ('Allow list', A), ('Allow list', A), ('Off', N)]),
        ('Connections', [('Allowed', Y), ('Allowed', Y), ('Approved only', A), ('GitHub', A)]),
        ('Computer', [('Allowed', Y)] * 4),
        ('Publishing', [('Needs approval', A)] * 3 + [('Off', N)]),
        ('Spending', [('Allowed', Y), ('Budget cap', A), ('Budget cap', A), ('Budget cap', A)])]
grid = ''.join(f'<div class="tr" style="grid-template-columns:1.6fr 1fr 1fr 1fr 1fr"><span class="t3">{n}</span>' + ''.join(gcell(t, k) for t, k in cells) + '</div>' for n, cells in rows)
lv = ''.join(f'<div class="card row" style="flex:1;padding:10px 14px;{"border-color:var(--ac);background:var(--ac2)" if i == 3 else ""}"><span class="n">{i}</span>{t}</div>' for i, t in [(1, 'Organization'), (2, 'Workspace'), (3, 'Space'), (4, 'Task')])
policy = f"""
<div class="row"><h1 class="t1" style="font-weight:600;flex:1">Policy and grants</h1><span class="chip">Administrator</span><button class="btn">Export audit</button></div>
<div class="row" style="align-items:flex-start;gap:20px">
  <section class="col" style="flex:1.5;gap:14px">
    <div><div class="lbl" style="margin-bottom:6px">Policy hierarchy: lower levels can only narrow</div><div class="row" style="gap:8px">{lv}</div></div>
    <div class="card" style="overflow:hidden"><div class="tr th" style="grid-template-columns:1.6fr 1fr 1fr 1fr 1fr"><span>Grant family</span><span>Org</span><span>Workspace</span><span>Product</span><span>This task</span></div>{grid}</div>
  </section>
  <section class="col" style="flex:1;gap:14px">
    <div class="card" style="padding:14px 16px"><div class="t2">Effective authority</div><div class="sub" style="margin:2px 0 8px">What "Launch dashboard" can do after every level is applied.</div>
      <div class="li">{pill('ok', 'Can')}<span>Read Product files</span></div><div class="li">{pill('ok', 'Can')}<span>Use the Product computer</span></div><div class="li">{pill('wait', 'Asks')}<span>Read GitHub, only if you approve the scope</span></div><div class="li">{pill('idle', 'Cannot')}<span>Reach the network or publish externally</span></div></div>
    <div class="card" style="padding:14px 16px"><div class="t2">Approval audit</div><div class="sub" style="margin:2px 0 8px">Each approval is tied to what was shown and can expire.</div>
      <div class="li">{pill('ok', 'Approved')}<span>Priya · make preview public · bound to digest</span></div><div class="li">{pill('idle', 'Expired')}<span>Marcus · post to #launch · not used in time</span></div></div>
  </section>
</div>
"""
board('Policy-Windows.dc.html', 'Policy on Windows', 1440, 900, win_frame('Policy - Agent Fabric', policy, 'shield'), WIN_CSS, FONT_WIN, r=8, rb=4, direction='column')
print('A done')
