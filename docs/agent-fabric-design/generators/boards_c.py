from lib import *
from boards_a import av, ctl, a_bar, steps_html

def tline(items):
    out = '<div class="card" style="padding:6px 0">'
    for i, (st, t, s) in enumerate(items):
        last = i == len(items) - 1
        if st == 'ok':
            mk = '<span class="mk" style="width:22px;height:22px;background:var(--ok);color:#fff;margin-top:12px">' + ic('check', 12, 3) + '</span>'
        elif st == 'idle':
            mk = '<span class="mk" style="width:22px;height:22px;border:2px dashed var(--ink3);margin-top:12px"></span>'
        else:
            mk = '<span class="mk" style="width:22px;height:22px;background:var(--waitbg);border:2px solid var(--wait);margin-top:12px"></span>'
        ln = '' if last else '<span style="flex:1;width:2px;background:var(--ln);margin:2px 0"></span>'
        out += f'<div class="row" style="align-items:stretch;gap:12px;padding:0 16px"><div class="col" style="align-items:center;width:22px;flex:none">{mk}{ln}</div><div style="padding:12px 0;flex:1"><div class="t3">{t}</div><div class="sub">{s}</div></div></div>'
    return out + '</div>'

STOP_ITEMS = [('ok', 'Request accepted', 'Your Stop was received'), ('ok', 'New steps blocked', 'Nothing further can start for this task'), ('ok', 'Running processes ended', 'On the Product computer'), ('wait', 'Actions outside Agent Fabric', 'We can confirm what we sent, not always what happened after')]
EXT = f'<div class="card"><div class="row" style="padding:12px 16px"><div style="flex:1"><div class="t3">Posted to #launch</div><div class="sub">Request sent before Stop</div></div>{pill("wait", "Outcome unknown")}</div><div class="row" style="padding:12px 16px;border-top:1px solid var(--ln)"><div style="flex:1"><div class="t3">Email to vendor</div><div class="sub">Held before sending</div></div>{pill("idle", "Not sent")}</div></div>'

# ================= IPAD =================
body = f"""
<div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:190px 0 0;gap:16px">
  <div style="width:520px;display:flex;flex-direction:column;gap:20px">
    <div class="row" style="gap:6px"><span style="width:24px;height:8px;border-radius:4px;background:var(--ac)"></span><span style="width:8px;height:8px;border-radius:4px;background:var(--ln)"></span><span style="width:8px;height:8px;border-radius:4px;background:var(--ln)"></span><span style="flex:1"></span><span class="sub">Step 1 of 3</span></div>
    <span style="width:56px;height:56px;border-radius:16px;background:var(--ac);color:var(--onac);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:26px">A</span>
    <h1 class="t1" style="font-size:36px">Your personal Space is ready</h1>
    <div style="font-size:17px;color:var(--ink2);line-height:1.5">It's private to you. Nothing here is shared with anyone unless you move it.</div>
    <div class="card">
      <div class="row" style="padding:14px 16px;align-items:flex-start;gap:12px">{tick('var(--ok)', 22)}<div><div class="t3">Personal Space created</div><div class="sub">Private to you</div></div></div>
      <div class="row" style="padding:14px 16px;border-top:1px solid var(--ln);align-items:flex-start;gap:12px">{tick('var(--ok)', 22)}<div><div class="t3">You can ask right away</div><div class="sub">A computer starts only when a task needs one</div></div></div>
      <div class="row" style="padding:14px 16px;border-top:1px solid var(--ln);align-items:flex-start;gap:12px"><span class="mk" style="width:22px;height:22px;border:2px solid var(--ink3)"></span><div><div class="t3">Connect a source</div><div class="sub">Optional. You can do this later.</div></div></div>
      <div class="row" style="padding:14px 16px;border-top:1px solid var(--ln);align-items:flex-start;gap:12px"><span class="mk" style="width:22px;height:22px;border:2px solid var(--ink3)"></span><div><div class="t3">Join or start a group Space</div><div class="sub">Optional. Groups are where work is shared.</div></div></div>
    </div>
    <div class="row"><a href="Chat-Tablet.dc.html" class="btn pri" style="flex:1">Ask your first question</a><button class="btn ghost" style="color:var(--ink3)">Skip for now</button></div>
  </div>
</div>"""
board('Onboarding-Tablet.dc.html', 'First run on iPad', 834, 1112, body, direction='column')

body = rail('spaces') + f"""
<main style="flex:1;min-width:0;padding:32px 36px 0;display:flex;flex-direction:column;gap:14px">
  <div class="row"><a style="color:var(--ac);font-weight:600">Task</a><span style="flex:1"></span></div>
  <div><div class="lbl">Task</div><h1 class="t1" style="font-size:28px;margin-top:2px">Vendor SOC 2 summary</h1></div>
  {tline(STOP_ITEMS)}
  <div class="lbl" style="padding-top:4px">External actions</div>
  {EXT}
  <div class="sub">Stopping does not undo anything that already left Agent Fabric.</div>
  <span style="flex:1"></span>
  <div style="border-top:1px solid var(--ln);padding:14px 0 28px" class="row"><button class="btn pri">Review external actions</button><a href="Home-Tablet.dc.html" class="btn">Done</a></div>
</main>"""
board('Stop-Tablet.dc.html', 'Stop result on iPad', 834, 1112, body)

body = rail('inbox') + f"""
<main style="flex:1;min-width:0;padding:32px 36px 0;display:flex;flex-direction:column;gap:14px">
  <div class="row">{pill('wait', 'Waiting for budget')}</div>
  <h1 class="t1" style="font-size:28px">Vendor SOC 2 summary</h1>
  <div class="sub" style="font-size:14px">Paused before the next step. Nothing was lost.</div>
  <div class="card" style="padding:14px 18px"><div class="lbl">Why it paused</div><div style="margin-top:4px;line-height:1.5">Your allowance for this Space is used up. The task needs more compute to finish the review of the remaining documents.</div></div>
  <div class="opt on"><span class="rd"><span></span></span><div><div class="t3">Add budget</div><div class="sub" style="margin-top:2px">Ask the budget owner for more, then resume where it stopped.</div></div></div>
  <div class="opt"><span class="rd"></span><div><div class="t3">Use a smaller scope</div><div class="sub" style="margin-top:2px">Finish with fewer documents, within what is left. You see exactly what is dropped.</div></div></div>
  <div style="padding:14px 18px;border-radius:12px;background:var(--sf2);color:var(--ink2);line-height:1.5"><b>Maximum overrun.</b> A step already running can finish after the limit is reached, so spending can go slightly past it. The amount is capped by that one step.</div>
  <span style="flex:1"></span>
  <div style="border-top:1px solid var(--ln);padding:14px 0 28px" class="row"><button class="btn pri">Request budget</button><button class="btn">Stop the task instead</button></div>
</main>"""
board('Budget-Tablet.dc.html', 'Waiting for budget on iPad', 834, 1112, body)

DF = """
.df{display:flex;gap:10px;padding:3px 12px;font-size:12px;line-height:1.5}
.df b{width:14px;flex:none;font-weight:700}
.df.add{background:var(--okbg);color:var(--ok)}
.df.del{background:var(--badbg);color:var(--bad)}
.df.ctx{color:var(--ink3)}
.mi{padding:10px 12px;border-radius:10px;display:flex;flex-direction:column;gap:3px;border:1px solid transparent}
.mi.on{background:var(--ac2);border-color:var(--ac)}
"""
diff = """<div class="card" style="overflow:hidden"><div style="padding:12px 16px" class="lbl">Change from version 3</div><div class="mono" style="padding-bottom:10px">
<div class="df ctx"><b></b><span>Read the attached interview notes.</span></div>
<div class="df add"><b>+</b><span>For each quote, find which interview it came from.</span></div>
<div class="df add"><b>+</b><span>If a source is unclear, ask before summarising.</span></div>
<div class="df del"><b>−</b><span>Summarise quotes directly under each theme.</span></div>
<div class="df ctx"><b></b><span>Group findings by theme and list open questions.</span></div></div></div>"""
body = rail('brain') + f"""
<section style="width:300px;flex:none;border-right:1px solid var(--ln);padding:32px 14px 0;display:flex;flex-direction:column;gap:6px">
  <h1 class="t1" style="font-size:26px;padding:0 6px 8px">Methods</h1>
  <div class="lbl" style="padding:0 6px">Active</div>
  <div class="mi"><span class="t3">Summarise interview notes</span><span class="sub">Version 3 · Product</span></div>
  <div class="mi"><span class="t3">Prepare weekly status</span><span class="sub">Version 5 · Product</span></div>
  <div class="lbl" style="padding:10px 6px 0">Proposed by Reflect</div>
  <div class="mi on"><span class="t3">Summarise interview notes</span><span class="sub">Add a source check · Inconclusive</span></div>
  <div class="mi"><span class="t3">Prepare weekly status</span><span class="sub">Shorter intro · Not enough runs</span></div>
</section>
<main style="flex:1;min-width:0;padding:32px 28px 0;display:flex;flex-direction:column;gap:12px">
  <div class="row"><h2 class="t1" style="font-size:22px;flex:1">Add a source check</h2>{pill('wait', 'Inconclusive')}</div>
  {diff}
  <div class="card" style="padding:12px 16px"><div class="lbl">Results so far</div><div style="margin-top:4px;line-height:1.5">The ranges overlap, so the difference could be chance. No percentages are shown until there are enough comparable runs.</div></div>
  <div class="card" style="padding:4px 16px"><div class="kv"><span>Release scope</span><span>Only me</span></div><div class="kv"><span>Approver</span><span>Priya, Space owner</span></div><div class="kv"><span>Rollback</span><span>One action, back to version 3</span></div></div>
  <div class="row"><button class="btn pri">Keep baseline</button><button class="btn">Collect more runs</button><button class="btn">Release to scope</button></div>
  <div class="card" style="padding:4px 16px"><div class="lbl" style="padding:10px 0 2px">Evidence</div><div class="kv"><span>Comparable runs</span><span>6 of 20 needed</span></div><div class="kv"><span>Checks that differ</span><span>None yet</span></div><div class="kv"><span>Reviewed by</span><span>Nobody yet. A person decides.</span></div></div>
</main>"""
board('Methods-Tablet.dc.html', 'Methods on iPad', 1194, 834, body, DF)

def conn_card(name, owner, status, on=False):
    st = 'border-color:var(--ac);background:var(--ac2)' if on else ''
    return f'<div class="card" style="padding:12px 16px;display:flex;flex-direction:column;gap:4px;{st}"><div class="row"><span class="t3" style="flex:1">{name}</span>{status}</div><div class="sub">{owner}</div></div>'
body = rail('settings') + f"""
<section style="width:440px;flex:none;border-right:1px solid var(--ln);padding:32px 16px 0;display:flex;flex-direction:column;gap:10px">
  <h1 class="t1" style="font-size:28px;padding:0 4px">Connections</h1>
  <div class="sub" style="padding:0 4px;line-height:1.5">Connected, readable and shareable are three different things.</div>
  {conn_card('Google Drive', 'Priya, personal · Only you', pill('ok', 'Connected'))}
  {conn_card('GitHub', 'Product service account · Product', pill('ok', 'Connected'))}
  {conn_card('Salesforce', 'Marcus, personal · Only Marcus', pill('wait', 'Reconnect'), True)}
  {conn_card('Slack', 'Product bot · Product', pill('ok', 'Connected'))}
  {conn_card('Linear', 'Priya, personal · Only you', pill('ok', 'Connected'))}
  {conn_card('Notion', 'Product service account · Product', pill('ok', 'Connected'))}
</section>
<main style="flex:1;min-width:0;padding:32px 28px 0;display:flex;flex-direction:column;gap:12px">
  <div><div class="lbl">Selected</div><h2 class="t1" style="font-size:24px;margin-top:2px">Salesforce</h2><div class="sub">Credential belongs to Marcus. Sign-in expired.</div></div>
  <div class="opt on"><span class="rd"><span></span></span><div><div class="t3">Use in a private task</div><div class="sub">Runs as Marcus, only in his own tasks.</div></div></div>
  <div class="opt"><span class="rd"></span><div><div class="t3">Request group approval</div><div class="sub">Asks Marcus to approve this connection for Product, after showing him the scopes and audience.</div></div></div>
  <div class="sub" style="line-height:1.5">An admin can see that this connection exists and who owns it. They cannot read its credential.</div>
  <div class="row"><button class="btn pri">Reconnect</button><button class="btn">Request group approval</button></div>
  <div class="card" style="padding:6px 16px;margin-top:8px"><div class="lbl" style="padding:10px 0 2px">Where this connection is used</div>
    <div class="kv"><span>Scope today</span><span>Read accounts and opportunities</span></div>
    <div class="kv"><span>Used by</span><span>Marcus, in 2 private tasks</span></div>
    <div class="kv"><span>Last successful read</span><span>3 days ago</span></div>
    <div class="kv"><span>Shared with a Space</span><span>No</span></div>
  </div>
  <div class="sub" style="line-height:1.5">Tasks that need Salesforce wait for sign-in. They never fall back to another person's credential.</div>
</main>"""
board('Connections-Tablet.dc.html', 'Connections on iPad', 1194, 834, body)

def fld(label, val):
    return f'<div class="col" style="gap:6px"><span style="font-size:12px;font-weight:600;color:var(--ink2)">{label}</span><div class="card row" style="height:44px;padding:0 14px;border-radius:8px;border-color:var(--ink3)">{val}</div></div>'
body = rail('spaces') + f"""
<section style="width:340px;flex:none;border-right:1px solid var(--ln);padding:32px 16px 0;display:flex;flex-direction:column;gap:10px">
  <div class="row"><h1 class="t1" style="font-size:28px;flex:1;padding:0 4px">Automations</h1><button class="btn sm pri">New</button></div>
  <div class="card" style="padding:12px 16px;border-color:var(--ac);background:var(--ac2)"><div class="row"><span class="t3" style="flex:1">Weekly metrics digest</span>{pill('ok', 'On')}</div><div class="sub">Weekdays · Product</div></div>
  <div class="card" style="padding:12px 16px"><div class="row"><span class="t3" style="flex:1">Vendor review</span>{pill('idle', 'Paused')}</div><div class="sub">Monthly · Research</div></div>
</section>
<main style="flex:1;min-width:0;padding:32px 32px 0;display:flex;flex-direction:column;gap:12px">
  <h2 class="t1" style="font-size:24px">Weekly metrics digest</h2>
  {fld('Name', 'Weekly metrics digest')}
  <div class="col" style="gap:6px"><span style="font-size:12px;font-weight:600;color:var(--ink2)">Repeats</span><div class="seg" style="max-width:340px"><span>Once</span><span>Daily</span><span class="on">Weekdays</span></div></div>
  <div class="row" style="gap:12px"><div style="flex:1">{fld('At', '9:00')}</div><div style="flex:1">{fld('Space', 'Product')}</div></div>
  <div class="card" style="padding:4px 16px"><div class="kv"><span>Delivers to</span><span>Inbox, then the Space chat</span></div><div class="kv"><span>If the last run is still going</span><span>Skip the next run</span></div><div class="kv"><span>If it needs approval</span><span>Waits in Inbox, never auto-approved</span></div><div class="kv"><span>Cost</span><span>Product cost centre, cap shown before saving</span></div></div>
  <div class="sub">Next run: the next weekday at 9:00. Each run is its own task with its own result.</div>
  <div class="row"><button class="btn pri">Save</button><button class="btn">Pause</button><button class="btn dng">Delete</button></div>
  <div class="card" style="padding:4px 16px"><div class="lbl" style="padding:10px 0 2px">Recent runs</div><div class="kv"><span>Mon 28 Sep, 09:00</span><span>Delivered to Inbox</span></div><div class="kv"><span>Mon 21 Sep, 09:00</span><span>Delivered to Inbox</span></div><div class="kv"><span>Mon 14 Sep, 09:00</span><span>Skipped, last run still going</span></div></div>
</main>"""
board('Automation-Tablet.dc.html', 'Automations on iPad', 1194, 834, body)

# ================= ANDROID =================
def a_tabs(active, names):
    return '<div class="row" style="border-bottom:1px solid var(--ln);padding:0 4px">' + ''.join(f'<span style="flex:1;height:48px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;color:{"var(--ac)" if n == active else "var(--ink3)"};border-bottom:3px solid {"var(--ac)" if n == active else "transparent"}">{n}</span>' for n in names) + '</div>'

body = f"""
<div style="background:var(--sf);padding:36px 8px 0;flex:none;border-bottom:1px solid var(--ln)">
  <div class="row" style="height:56px"><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">{ic('back', 24)}</span><span style="font-size:22px;font-weight:600;flex:1">Product</span><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">{ic('settings', 24)}</span></div>
  <div class="row" style="padding:0 8px 8px;gap:6px"><span class="chip">12 members</span><span class="chip">Computer asleep</span><span class="chip">Model: Auto</span></div>
  {a_tabs('Chat', ['Chat', 'Work', 'Files', 'Computer'])}
</div>
<div style="flex:1;overflow:hidden;padding:12px 16px 0;display:flex;flex-direction:column;gap:10px">
  <div class="row" style="gap:8px">{av('DK')}<div class="sub" style="line-height:1.3"><b style="color:var(--ink)">Daniel</b>: Can we show it Thursday?<br><span style="font-size:12px">Discussion. Not sent to the agent.</span></div></div>
  <div style="align-self:flex-end;max-width:88%;background:var(--ac);color:var(--onac);border-radius:20px 20px 6px 20px;padding:10px 16px">Make a dashboard prototype for the launch review from last quarter's metrics.<div style="font-size:12px;opacity:.85;margin-top:2px">Act</div></div>
  <div class="card" style="padding:12px 16px"><div class="row" style="padding-bottom:4px"><span class="t2" style="flex:1">Ready to start</span>{pill('idle', 'Preflight')}</div>
    <div class="kv"><span>Result</span><span>Design prototype, versioned draft</span></div><div class="kv"><span>Sources</span><span>Q3 metrics, Brand tokens v6</span></div><div class="kv"><span>Audience</span><span>Product, 12 members</span></div><div class="kv"><span>Computer</span><span>Starts only if needed</span></div>
    <div class="row" style="padding-top:8px"><button class="btn pri" style="flex:1">Start</button><button class="btn">Edit</button></div></div>
</div>
<div style="background:var(--sf);border-top:1px solid var(--ln);padding:8px 12px;flex:none"><div class="row"><div class="seg" style="border-radius:20px"><span style="border-radius:18px;min-width:48px">Ask</span><span style="border-radius:18px;min-width:48px">Plan</span><span class="on" style="border-radius:18px;min-width:48px">Act</span></div><span style="flex:1;color:var(--ink3);padding:0 6px">Message Product</span><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">{ic('mic', 24)}</span></div></div>
{android_nav('spaces')}"""
board('Chat-Android.dc.html', 'Space chat on Android phone', 412, 892, body, AND_CSS, FONT_AND, r=16, rb=24, direction='column')

def sp_a(name, sub, pk, pt, on=False):
    return f'<div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:4px;{"background:var(--ac2);border-color:var(--ac)" if on else ""}"><div class="row"><span class="t2" style="flex:1">{name}</span>{pill(pk, pt)}</div><div class="sub">{sub}</div></div>'
body = f"""
<div style="flex:1;overflow:hidden;padding:36px 16px 0;display:flex;flex-direction:column;gap:10px">
  {a_bar('Spaces', False)}
  <div class="row" style="height:56px;padding:0 16px;border-radius:28px;background:var(--sf2);color:var(--ink2)">{ic('search', 24)}<span style="flex:1;margin-left:4px">Search Spaces</span></div>
  {sp_a('Product', 'Shared · 12 members · default group Space', 'ok', 'Awake', True)}
  {sp_a('Personal', 'Private to you · default personal Space', 'idle', 'Asleep')}
  {sp_a('Research', 'Shared · 5 members', 'idle', 'Asleep')}
  {sp_a('Platform ops', 'Shared · 7 members · health unknown', 'wait', 'No signal')}
  <div class="sub" style="padding:0 4px">Opening a Space changes what you see. It never moves a running task.</div>
</div>
<div style="position:absolute;right:16px;bottom:116px"><span class="btn pri" style="height:56px;border-radius:16px;padding:0 20px">{ic('plus', 24)}New Space</span></div>
{android_nav('spaces')}"""
board('Spaces-Android.dc.html', 'Spaces on Android phone', 412, 892, body, AND_CSS, FONT_AND, r=16, rb=24, direction='column')

body = f"""
<div style="flex:1;overflow:hidden;padding:36px 16px 0;display:flex;flex-direction:column;gap:10px">
  {a_bar('Stop')}
  <div><div class="lbl">Task</div><div class="t2" style="font-size:20px;margin-top:2px">Vendor SOC 2 summary</div></div>
  {tline(STOP_ITEMS)}
  {EXT}
  <div class="sub" style="padding:0 4px">Stopping does not undo anything that already left Agent Fabric.</div>
</div>
<div style="padding:12px 16px 28px;display:flex;flex-direction:column;gap:8px;flex:none"><button class="btn pri" style="width:100%">Review external actions</button><button class="btn" style="width:100%">Done</button></div>"""
board('Stop-Android.dc.html', 'Stop result on Android phone', 412, 892, body, AND_CSS, FONT_AND, r=16, rb=24, direction='column')

def res(title, meta, right=''):
    return f'<div class="row" style="padding:10px 4px;min-height:56px"><div class="col" style="flex:1"><span class="t3">{title}</span><span class="sub">{meta}</span></div>{right}</div>'
body = f"""
<div style="flex:1;overflow:hidden;padding:36px 16px 0;display:flex;flex-direction:column;gap:10px">
  <div class="row" style="height:56px;padding:0 16px;border-radius:28px;background:var(--sf2);gap:12px">{ic('back', 24)}<span style="flex:1;font-weight:500;font-size:16px">launch</span>{ic('x', 24)}</div>
  <div class="row"><span class="chip on">This Space</span><span class="chip">All Spaces</span></div>
  <div class="lbl" style="padding-top:6px">Tasks</div><div class="card" style="padding:0 14px">{res('Launch dashboard', 'Product · Priya', pill('run', 'Running'))}</div>
  <div class="lbl" style="padding-top:6px">Files</div><div class="card" style="padding:0 14px">{res('launch-requirements.md', 'Product files')}</div>
  <div class="lbl" style="padding-top:6px">Memories</div><div class="card" style="padding:0 14px">{res('Launch review owners', 'Product', pill('ok', 'Saved here'))}</div>
  <div class="lbl" style="padding-top:6px">People</div><div class="card" style="padding:0 14px">{res('Priya', 'Owner of Product')}</div>
  <div class="sub" style="padding:4px">Results only include what you can access in the chosen scope.</div>
</div>"""
board('Search-Android.dc.html', 'Search on Android phone', 412, 892, body, AND_CSS, FONT_AND, r=16, rb=24, direction='column')

def meter(n, w, v):
    return f'<div class="row" style="padding:5px 0"><span style="width:64px">{n}</span><div style="flex:1;height:8px;border-radius:4px;background:var(--sf2)"><span style="display:block;width:{w}%;height:8px;border-radius:4px;background:var(--ac)"></span></div><span style="width:72px;text-align:right;font-weight:600">{v}</span></div>'
body = f"""
<div style="flex:1;overflow:hidden;padding:36px 16px 0;display:flex;flex-direction:column;gap:10px">
  {a_bar('Computer')}
  <div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px"><div class="row"><div style="flex:1"><div class="t2">Computer is awake</div><div class="sub">Last signal 12 s ago</div></div>{pill('ok', 'Healthy')}</div><div style="height:1px;background:var(--ln)"></div><div><div class="lbl">Working on</div><div class="t3" style="margin-top:2px">Fix flaky export test</div><div class="sub">Verifying · 2 of 3 required checks</div></div><div><div class="lbl">Right now</div><div style="margin-top:2px">Waiting for a model. Nothing needs you.</div></div></div>
  <div class="card" style="padding:12px 16px"><div class="lbl">Pressure</div>{meter('CPU', 22, 'Low')}{meter('Memory', 55, 'Moderate')}{meter('Disk', 30, 'Low')}</div>
  <div class="card" style="padding:12px 16px"><div class="lbl">Cost</div><div style="margin-top:2px">Billed once to Product, shared by 2 tasks. Idle computers suspend.</div></div>
  <div class="card" style="padding:12px 16px"><div class="lbl">Watching</div><div class="row" style="margin-top:8px">{av('PR')}{av('MA')}<span class="sub">2 people can see this computer</span></div></div>
</div>
<div style="padding:12px 16px 28px;display:flex;flex-direction:column;gap:8px;flex:none"><button class="btn pri" style="width:100%">Take over screen</button><button class="btn" style="width:100%">Stop this task</button></div>"""
board('Computer-Android.dc.html', 'Computer on Android phone', 412, 892, body, AND_CSS, FONT_AND, r=16, rb=24, direction='column')

# Foldable (open): rail + list + detail
def li_a(kind, t, s, when, on=False):
    return f'<div style="padding:14px 16px;border-radius:16px;display:flex;flex-direction:column;gap:4px;min-height:84px;{"background:var(--ac2)" if on else ""}"><div class="row">{pill(kind[0], kind[1])}<span style="flex:1"></span><span class="sub">{when}</span></div><div class="t3">{t}</div><div class="sub">{s}</div></div>'
nb = ''.join(f'<a style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;font-weight:600;color:{"var(--acd)" if k == "inbox" else "var(--ink2)"}"><span style="width:56px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:{"var(--ac2)" if k == "inbox" else "none"}">{ic(k, 24)}</span>{l}</a>' for k, l in [('home', 'Home'), ('spaces', 'Spaces'), ('inbox', 'Inbox')])
body = f"""
<nav style="width:80px;flex:none;background:var(--sf2);padding:48px 0 16px;display:flex;flex-direction:column;align-items:center;gap:18px">{nb}</nav>
<section style="width:340px;flex:none;padding:40px 12px 0;display:flex;flex-direction:column;gap:6px">
  <div class="row" style="height:56px;padding:0 4px"><span style="font-size:24px;font-weight:600;flex:1">Inbox</span></div>
  <div class="row" style="padding-bottom:6px"><span class="chip on" style="height:36px;padding:0 14px">Needs you · 3</span><span class="chip" style="height:36px;padding:0 14px">All</span></div>
  {li_a(('wait', 'Approval'), 'Make launch preview public', 'Dashboard prototype · Priya', '3 min')}
  {li_a(('wait', 'Input'), 'Which interview set should I use?', 'Summarise Q3 interview notes', '12 min', True)}
  {li_a(('wait', 'Budget'), 'Vendor SOC 2 summary', 'Allowance reached · you', '1 h')}
</section>
<main style="flex:1;min-width:0;margin:16px 16px 16px 0;background:var(--sf);border-radius:28px;padding:36px 28px 24px;display:flex;flex-direction:column;gap:14px">
  <div class="row">{pill('wait', 'Input needed')}<span class="sub">Computer asleep</span></div>
  <h2 style="margin:0;font-size:24px;font-weight:600;line-height:1.2">Which interview set should I use?</h2>
  <div class="sub" style="font-size:14px;line-height:1.5">I found two sets that could match "Q3 interview notes". Your answer updates the task's requirements.</div>
  <div class="opt on" style="align-items:center"><span class="rd"><span></span></span><div><div class="t3">Q3 interviews only</div><div class="sub">Notes tagged Q3 in Files</div></div></div>
  <div class="opt" style="align-items:center"><span class="rd"></span><div><div class="t3">Q3 interviews plus pilot sessions</div><div class="sub">Adds the pilot notes from September</div></div></div>
  <span style="flex:1"></span>
  <div class="row"><button class="btn pri">Send answer</button><button class="btn">Open task</button></div>
</main>"""
board('Fold-Android.dc.html', 'Inbox on Android foldable, open', 884, 1104, body, AND_CSS, FONT_AND, r=16, rb=24)
print('C done')
