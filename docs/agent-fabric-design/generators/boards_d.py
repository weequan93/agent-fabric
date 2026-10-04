from lib import *
from boards_a import av, ctl, win_frame, devices as _dv
from boards_b import dark_of

# ================= WINDOWS =================
def tabs_row(active, names):
    return '<div style="border-bottom:1px solid var(--ln)">' + ''.join(f'<span style="display:inline-flex;height:40px;padding:0 4px;margin-right:20px;align-items:center;font-weight:600;color:{"var(--ac)" if n == active else "var(--ink3)"};border-bottom:2px solid {"var(--ac)" if n == active else "transparent"}">{n}</span>' for n in names) + '</div>'

chat = f"""
<div class="row"><h1 class="t1" style="font-weight:600;flex:1">Product</h1><span class="chip">12 members</span>{pill('idle', 'Computer asleep')}</div>
{tabs_row('Chat', ['Chat', 'Work', 'Files', 'Computer'])}
<div class="row" style="align-items:flex-start;gap:20px;flex:1;min-height:0">
  <section class="col" style="flex:1.4;gap:12px">
    <div class="row" style="gap:8px">{av('DK')}<div class="sub" style="line-height:1.3"><b style="color:var(--ink)">Daniel</b>: Can we show it Thursday?<br><span style="font-size:12px">Discussion. Not sent to the agent.</span></div></div>
    <div style="align-self:flex-end;max-width:70%;background:var(--ac);color:var(--onac);border-radius:8px;padding:10px 14px">Make a dashboard prototype for the launch review from last quarter's metrics.<div style="font-size:12px;opacity:.85;margin-top:2px">Act</div></div>
    <span style="flex:1"></span>
    <div class="card" style="padding:10px 14px"><div style="color:var(--ink3);padding:4px 0 10px">Message Product</div><div class="row"><div class="seg" style="width:220px"><span>Ask</span><span>Plan</span><span class="on">Act</span></div><span style="flex:1"></span>{ic('mic')}<button class="btn pri">Send</button></div></div>
    <div style="height:20px"></div>
  </section>
  <section class="card" style="flex:1;padding:16px 18px"><div class="row" style="padding-bottom:6px"><span class="t2" style="flex:1">Ready to start</span>{pill('idle', 'Preflight')}</div>
    <div class="kv"><span>Result</span><span>Design prototype, versioned draft</span></div><div class="kv"><span>Sources</span><span>Q3 metrics sheet, Brand tokens v6</span></div><div class="kv"><span>Audience</span><span>Product, 12 members</span></div><div class="kv"><span>Computer</span><span>Starts only if needed</span></div><div class="kv"><span>Cost</span><span>Product cost centre, up to $15.00</span></div><div class="kv"><span>Later approval</span><span>Publishing outside Product</span></div>
    <div class="row" style="margin-top:10px"><button class="btn pri">Start</button><button class="btn">Edit</button></div></section>
</div>"""
board('Chat-Windows.dc.html', 'Space chat on Windows', 1440, 900, win_frame('Product - Agent Fabric', chat, 'spaces'), WIN_CSS, FONT_WIN, r=8, rb=4, direction='column')

def lrow(k, t, s, when, on=False):
    return f'<div style="padding:12px 14px;border-radius:8px;display:flex;flex-direction:column;gap:4px;{"background:var(--ac2)" if on else ""}"><div class="row">{pill(k[0], k[1])}<span style="flex:1"></span><span class="sub">{when}</span></div><div class="t3">{t}</div><div class="sub">{s}</div></div>'
inbox = f"""
<div class="row"><h1 class="t1" style="font-weight:600;flex:1">Inbox</h1><span class="chip on">Needs you · 3</span><span class="chip">All activity</span></div>
<div class="row" style="align-items:flex-start;gap:24px;flex:1;min-height:0">
  <section class="col" style="width:420px;flex:none;gap:4px">
    {lrow(('wait', 'Approval'), 'Make launch preview public', 'Dashboard prototype · Priya · Product', '3 min', True)}
    {lrow(('wait', 'Input'), 'Which interview set should I use?', 'Summarise Q3 interview notes', '12 min')}
    {lrow(('wait', 'Budget'), 'Vendor SOC 2 summary', 'Allowance reached · you', '1 h')}
  </section>
  <section class="col" style="flex:1;gap:14px">
    <div class="row">{pill('wait', 'Approval needed')}<span class="sub">Requested by Priya</span></div>
    <h2 style="margin:0;font-size:24px;font-weight:600">Make launch preview public</h2>
    <div style="padding:12px 16px;border-radius:8px;background:var(--waitbg);color:var(--ink);display:flex;gap:10px;align-items:flex-start"><span style="color:var(--wait)">{ic('warn')}</span><div><b>This leaves Product.</b> Anyone with the link can open it.</div></div>
    <div class="card" style="padding:4px 16px"><div class="kv"><span>Action</span><span>Create a public preview link</span></div><div class="kv"><span>Artifact</span><span>Launch dashboard, v4 · <span class="mono">digest a91c4e07…b2d6</span></span></div><div class="kv"><span>Lifetime</span><span>7 days, you can revoke it</span></div><div class="kv"><span>Checks</span><span>3 of 3 passed. Automated evidence, not certification.</span></div><div class="kv"><span>Expires</span><span>Today, in 3 h</span></div></div>
    <div class="sub">Approves version 4 only. Any edit, new recipient or policy change cancels this approval.</div>
    <div class="row"><button class="btn pri">Approve with Windows Hello</button><button class="btn">Ask for changes</button><button class="btn">Decline</button></div>
  </section>
</div>"""
board('Inbox-Windows.dc.html', 'Inbox on Windows', 1440, 900, win_frame('Inbox - Agent Fabric', inbox, 'inbox'), WIN_CSS, FONT_WIN, r=8, rb=4, direction='column')

def mrow(t, pk, pt, scope, ver, on=False):
    return f'<div class="tr" style="grid-template-columns:2fr 1.2fr 1fr 1fr;{"background:var(--ac2)" if on else ""}"><span class="t3">{t}</span><span>{pill(pk, pt)}</span><span>{scope}</span><span>{ver}</span></div>'
mem = f"""
<div class="row"><h1 class="t1" style="font-weight:600;flex:1">Memory inspector</h1><span class="chip">Product Space</span><button class="btn">Export list</button></div>
<div class="row"><span class="chip on">All</span><span class="chip">Saved here</span><span class="chip">Pending review</span><span class="chip">Not saved</span><span class="chip">Expired</span></div>
<div class="row" style="align-items:flex-start;gap:20px">
  <section class="card" style="flex:1.5;overflow:hidden"><div class="tr th" style="grid-template-columns:2fr 1.2fr 1fr 1fr"><span>Record</span><span>Status</span><span>Scope</span><span>Last verified</span></div>
    {mrow('Launch review owners', 'ok', 'Saved here', 'Product', 'Not yet', True)}{mrow('Prefers weekly summaries', 'wait', 'Pending review', 'Product', 'Not yet')}{mrow('Brand voice guide', 'ok', 'Saved here', 'Product', 'From Files')}{mrow('Draft pricing note', 'idle', 'Not saved', 'One task', 'None')}{mrow('Old launch date', 'idle', 'Expired', 'Product', 'Past expiry')}</section>
  <section class="col" style="flex:1;gap:14px">
    <div class="card" style="padding:14px 16px"><div class="lbl">Sources used · Launch dashboard</div><div class="li" style="margin-top:4px">{pill('ok', 'Used')}<span>3 memories from Product</span></div><div class="li">{pill('ok', 'Used')}<span>2 files you attached</span></div><div class="li">{pill('idle', 'Left out')}<span>1 memory from another Space</span></div><div class="li">{pill('idle', 'Off')}<span>Older conversations, by your setting</span></div></div>
    <div class="card" style="padding:14px 16px;border-color:var(--bad)"><div class="t3" style="color:var(--bad)">If you forget "Launch review owners"</div><div class="sub" style="margin:6px 0 10px;line-height:1.5">It leaves recall for every future task. 2 earlier results cite it; they stay, marked "source forgotten". Exported copies are not recalled.</div><div class="row"><button class="btn dng">Forget memory</button><button class="btn">Review the 2 results</button></div></div>
  </section>
</div>"""
board('Memory-Windows.dc.html', 'Memory inspector on Windows', 1440, 900, win_frame('Knowledge - Agent Fabric', mem, 'brain'), WIN_CSS, FONT_WIN, r=8, rb=4, direction='column')

def step(done, t, s, btn):
    mk = f'<span class="mk" style="width:24px;height:24px;background:var(--ok);color:#fff">{ic("check", 13, 3)}</span>' if done else '<span class="mk" style="width:24px;height:24px;border:2px solid var(--wait)"></span>'
    return f'<div class="row" style="gap:14px;padding:14px 16px;border-top:1px solid var(--ln);{"" if done else "background:var(--waitbg)"}">{mk}<div style="flex:1"><div class="t3">{t}</div><div class="sub">{s}</div></div>{btn}</div>'
setup = f"""
<div class="row"><h1 class="t1" style="font-weight:600;flex:1">Set up your workspace</h1><span class="chip">Administrator</span><span class="sub">3 of 5 steps done</span></div>
<div class="sub" style="max-width:780px">A workspace can start tasks once it has a model route and a budget. The other steps can follow.</div>
<div class="row" style="align-items:flex-start;gap:20px">
  <section class="card" style="flex:1.5;overflow:hidden">
    {step(True, 'Model route', 'Workspace default is set. Spaces can override it.', '<button class="btn">Edit</button>').replace('border-top:1px solid var(--ln);', '')}
    {step(True, 'Runtime policy', 'Standard profile. Computers have no outbound access unless a task asks.', '<button class="btn">Edit</button>')}
    {step(True, 'Membership', 'You are the first administrator. Invite others later.', '<button class="btn">Edit</button>')}
    {step(False, 'Data region', 'Choose where workspace data is kept. <span class="ph">Region placeholder</span>', '<button class="btn">Choose</button>')}
    {step(False, 'Budget', 'Not set. Tasks that need compute will wait for budget.', '<button class="btn pri">Set budget</button>')}
  </section>
  <section class="col" style="flex:1;gap:14px">
    <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:8px">{pill('idle', 'Software-only assurance')}<div class="t2">What these settings guarantee</div><div class="sub" style="line-height:1.5">Agent Fabric enforces these settings in software. They do not replace your own hardware controls, network rules or contracts.</div></div>
    <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px"><div class="t3">Ready to finish?</div><div class="sub">2 steps left. You can finish now and complete them from Settings.</div><div class="row"><button class="btn dis" aria-disabled="true">Finish setup</button><button class="btn">Save and return later</button></div></div>
  </section>
</div>"""
board('Setup-Windows.dc.html', 'Administrator setup on Windows', 1440, 900, win_frame('Admin setup - Agent Fabric', setup, 'settings'), WIN_CSS, FONT_WIN, r=8, rb=4, direction='column')

# ================= DARK (derived) =================
import re
def dark2(src, dst, title, extra_map=None):
    dark_of(src, dst, title)
    if extra_map:
        s = open(f'{OUT}/{dst}').read()
        for a, b in extra_map.items(): s = s.replace(a, b)
        open(f'{OUT}/{dst}', 'w').write(s)
dark2('Chat-Phone.dc.html', 'Chat-Dark-Phone.dc.html', 'Space chat on iPhone, dark')
dark2('Settings-Phone.dc.html', 'Settings-Dark-Phone.dc.html', 'Settings on iPhone, dark')
dark2('Inbox-Desktop.dc.html', 'Inbox-Dark-Desktop.dc.html', 'Inbox on Mac, dark')
dark2('Design-Desktop.dc.html', 'Design-Dark-Desktop.dc.html', 'Design Studio on Mac, dark')
dark2('Android-Phone.dc.html', 'Android-Dark-Phone.dc.html', 'Home on Android phone, dark', {'#E9EDF6': '#141C24', '#D4DCF7': 'var(--ac2)'})

# ================= RESPONSIVE =================
def home_content(pad):
    def it(k, t, s):
        return f'<div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:6px"><div class="row">{pill(k[0], k[1])}</div><div class="t3">{t}</div><div class="sub">{s}</div></div>'
    return f"""
<div class="row"><h1 class="t1" style="font-size:30px;flex:1">Home</h1>{av('MO', 32)}</div>
<div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:10px"><div style="color:var(--ink3)">Ask about Product's decisions, files and sources...</div><div class="seg"><span class="on">Ask</span><span>Plan</span><span>Act</span></div><div class="row"><span class="chip">Product · 12 members</span><span style="flex:1"></span>{ic('mic')}<span class="mk" style="width:36px;height:36px;background:var(--ac);color:var(--onac)">{ic('plus', 18)}</span></div></div>
<div class="lbl">Needs you · 3</div>
{it(('wait', 'Approval'), 'Make launch preview public', 'Review action · expires in 3 h')}
{it(('wait', 'Input'), 'Which interview set should I use?', 'Clarify · 12 min ago')}
<div class="lbl">Running</div>
{it(('run', 'Verifying'), 'Fix flaky export test', 'Verifying · 2 of 3 required checks')}"""

body = f'<div style="flex:1;overflow:hidden;padding:52px 16px 0;display:flex;flex-direction:column;gap:10px">{home_content(16)}</div>' + phone_tabs('home')
board('Home-SlideOver.dc.html', 'Home in iPad Slide Over', 320, 1112, body, direction='column')
body = f'<div style="flex:1;overflow:hidden;padding:52px 20px 0;display:flex;flex-direction:column;gap:12px">{home_content(20)}</div>' + phone_tabs('home')
board('Home-SplitView.dc.html', 'Home in iPad Split View', 504, 1112, body, direction='column')

body = rail('home') + f"""
<main style="flex:1;min-width:0;display:flex;flex-direction:column">
  <div class="row" style="height:36px;padding:0 14px;gap:8px;flex:none"><span style="width:12px;height:12px;border-radius:6px;background:#FF5F57"></span><span style="width:12px;height:12px;border-radius:6px;background:#FEBC2E"></span><span style="width:12px;height:12px;border-radius:6px;background:#28C840"></span></div>
  <div style="flex:1;padding:12px 32px 0;display:flex;flex-direction:column;gap:12px;overflow:hidden">{home_content(32)}
    <div class="row" style="padding:12px 14px;border-radius:12px;background:var(--sf2);color:var(--ink2);margin-top:6px"><div style="line-height:1.4"><b>Medium window.</b> Below 900 px the sidebar collapses to icons and the content stays one column.</div></div></div>
</main>"""
board('Home-NarrowWindow.dc.html', 'Home in a narrow Mac window', 680, 900, body)

body = f"""
<nav style="width:104px;flex:none;background:var(--sf2);border-right:1px solid var(--ln);padding:12px 8px 12px 44px;display:flex;flex-direction:column;align-items:center;gap:6px;justify-content:center"><a class="rb" style="width:52px;height:52px">{ic('home')}</a><a class="rb on" style="width:52px;height:52px">{ic('spaces')}</a><a class="rb" style="width:52px;height:52px">{ic('inbox')}</a></nav>
<div style="flex:1;min-width:0;display:flex;flex-direction:column;padding:8px 44px 10px 0">
  <div class="row" style="height:44px;padding-left:16px"><span style="color:var(--ac);font-weight:600">{ic('back')}</span><span class="t2" style="flex:1">Product</span><span class="chip">12 members</span><span class="chip">Computer asleep</span></div>
  <div style="flex:1;padding:4px 16px;display:flex;flex-direction:column;gap:8px;overflow:hidden">
    <div class="row" style="gap:8px">{av('DK', 24)}<div class="sub" style="line-height:1.3"><b style="color:var(--ink)">Daniel</b>: Can we show it Thursday? <span style="font-size:12px">Discussion only.</span></div></div>
    <div style="align-self:flex-end;max-width:70%;background:var(--ac);color:var(--onac);border-radius:14px 14px 4px 14px;padding:8px 12px">Make a dashboard prototype for the launch review.<span style="font-size:12px;opacity:.85"> · Act</span></div>
    <div class="card row" style="padding:10px 14px"><div style="flex:1"><div class="t3">Ready to start</div><div class="sub">Design prototype · Product, 12 members · up to $15.00</div></div>{pill('idle', 'Preflight')}<button class="btn sm pri">Start</button><button class="btn sm">Edit</button></div>
  </div>
  <div class="card row" style="margin:0 16px;padding:0 8px 0 12px;height:48px"><div class="seg" style="width:190px"><span style="height:32px;min-width:0">Ask</span><span style="height:32px;min-width:0">Plan</span><span class="on" style="height:32px;min-width:0">Act</span></div><span style="flex:1;color:var(--ink3);padding:0 8px">Message Product</span>{ic('mic')}</div>
</div>"""
board('Chat-Landscape-Phone.dc.html', 'Space chat on iPhone, landscape', 844, 390, body)

# ================= NEW FLOWS =================
def f_(label, val, hint=''):
    h = f'<span class="sub" style="font-size:12px">{hint}</span>' if hint else ''
    return f'<div class="col" style="gap:6px"><span style="font-size:12px;font-weight:600;color:var(--ink2)">{label}</span><div class="card row" style="height:48px;padding:0 14px;border-radius:10px;border-color:var(--ink3)">{val}</div>{h}</div>'
body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:12px">
  <div class="row" style="height:44px"><span style="color:var(--ac);font-weight:600;width:60px">Cancel</span><span class="t3" style="flex:1;text-align:center">New Space</span><span style="width:60px"></span></div>
  {f_('Name', 'Launch review')}
  <div class="col" style="gap:8px"><span style="font-size:12px;font-weight:600;color:var(--ink2)">Who is it for</span>
    <div class="opt"><span class="rd"></span><div><div class="t3">Just me</div><div class="sub">Private. Nobody else can see it.</div></div></div>
    <div class="opt on"><span class="rd"><span></span></span><div><div class="t3">A group</div><div class="sub">Members you invite share chat, files and results.</div></div></div></div>
  <div class="card" style="padding:4px 14px"><div class="kv"><span>Storage</span><span>New, this Space only</span></div><div class="kv"><span>Memory</span><span>Separate to this Space</span></div><div class="kv"><span>Computer</span><span>Starts only when needed</span></div><div class="kv"><span>Model</span><span>Workspace default</span></div></div>
  <div class="sub" style="padding:0 4px;line-height:1.45">You can change these later. Changes apply to new tasks only.</div>
</div>
<div style="background:var(--sf);border-top:1px solid var(--ln);padding:12px 16px 34px;flex:none"><button class="btn pri" style="width:100%">Create Space</button></div>"""
board('NewSpace-Phone.dc.html', 'New Space on iPhone', 390, 844, body, direction='column')

body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:12px">
  <div class="row" style="height:44px"><span style="color:var(--ac);font-weight:600;width:60px">Cancel</span><span class="t3" style="flex:1;text-align:center">Invite to Product</span><span style="width:60px"></span></div>
  <div class="card row" style="height:48px;padding:0 14px;gap:8px;border-color:var(--ac)">{ic('search')}<span style="color:var(--ink3)">Name or email</span></div>
  <div class="row" style="flex-wrap:wrap"><span class="chip on" style="height:32px">Lena {ic('x', 14)}</span><span class="chip on" style="height:32px">Dev {ic('x', 14)}</span></div>
  <div class="col" style="gap:6px"><span style="font-size:12px;font-weight:600;color:var(--ink2)">Role</span><div class="seg"><span class="on">Member</span><span>Viewer</span></div></div>
  <div class="card" style="padding:12px 14px"><div class="lbl">A Member can</div><div class="li" style="margin-top:4px">{tick('var(--ok)', 18)}<span>Start tasks and chat</span></div><div class="li">{tick('var(--ok)', 18)}<span>Approve their own tasks</span></div><div class="li"><span class="mk" style="width:18px;height:18px;border:2px solid var(--ink3)"></span><span>Use group connections: not by default</span></div></div>
  <div class="row" style="padding:12px 14px;border-radius:12px;background:var(--sf2);color:var(--ink2);align-items:flex-start">{ic('eye')}<div style="line-height:1.45">They see this Space's chat, files and results. They don't see your private work or other Spaces.</div></div>
</div>
<div style="background:var(--sf);border-top:1px solid var(--ln);padding:12px 16px 34px;flex:none"><button class="btn pri" style="width:100%">Send 2 invitations</button></div>"""
board('Invite-Phone.dc.html', 'Invite members on iPhone', 390, 844, body, direction='column')

body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:10px">
  <div class="row" style="height:44px"><span style="color:var(--ac);font-weight:600;width:60px">Home</span><span class="t3" style="flex:1;text-align:center">Account</span><span style="width:60px"></span></div>
  <div class="card row" style="padding:14px 16px;gap:12px">{av('MO', 48)}<div><div class="t2">Maya O.</div><div class="sub">maya@example.com</div></div></div>
  <div class="lbl" style="padding:6px 4px 0">Security</div>
  <div class="card"><div class="ctl"><div style="flex:1"><div class="t3">Signed-in devices</div><div class="sub">4 devices</div></div>{ic('chev', 18)}</div><div class="ctl"><div style="flex:1"><div class="t3">Face ID for approvals</div><div class="sub">Required before you approve</div></div><span class="tg on" role="switch" aria-checked="true" aria-label="Face ID"></span></div></div>
  <div class="lbl" style="padding:6px 4px 0">Your data</div>
  <div class="card"><div class="ctl"><div style="flex:1"><div class="t3">Export my data</div><div class="sub">Your personal Space and settings</div></div>{ic('dl', 20)}</div><div class="ctl"><div style="flex:1"><div class="t3">Notifications</div><div class="sub">Needs you, updates, quiet hours</div></div>{ic('chev', 18)}</div></div>
  <div class="card" style="border-color:var(--bad)"><div class="ctl"><div style="flex:1"><div class="t3" style="color:var(--bad)">Delete my account</div><div class="sub">Reviewed first. Group Spaces you own need a new owner.</div></div>{ic('chev', 18)}</div></div>
  <button class="btn" style="width:100%;margin-top:4px">Sign out</button>
</div>"""
board('Account-Phone.dc.html', 'Account on iPhone', 390, 844, body, direction='column')

ev = [('ok', 'Requirements set', 'Captured from your message, then confirmed.', 'You'), ('ok', 'Preflight accepted', 'Scope, resources and cost shown first.', 'Priya'), ('ok', 'Computer started', 'Started when the first step needed it.', 'System'),
      ('ok', 'Draft layout produced', 'Saved as version 1 of the draft.', 'Agent'), ('ok', 'Checks run', '3 of 3 passed. Automated evidence, not certification.', 'System'), ('ok', 'Version 4 saved', 'Versioned draft, not published.', 'Agent'),
      ('wait', 'Approval requested', 'Make launch preview public. Bound to a digest of version 4.', 'Agent'), ('idle', 'Delivery', 'Not started. Waiting for approval.', '')]
def evrow(i, k, t, s, who):
    mk = {'ok': f'<span class="mk" style="width:22px;height:22px;background:var(--ok);color:#fff">{ic("check", 12, 3)}</span>', 'wait': '<span class="mk" style="width:22px;height:22px;border:2px solid var(--wait);background:var(--waitbg)"></span>', 'idle': '<span class="mk" style="width:22px;height:22px;border:2px dashed var(--ink3)"></span>'}[k]
    return f'<div class="row" style="align-items:flex-start;gap:14px;padding:12px 16px;border-top:1px solid var(--ln)"><span class="mono" style="width:20px;color:var(--ink3);padding-top:3px">{i}</span>{mk}<div style="flex:1"><div class="t3">{t}</div><div class="sub">{s}</div></div><span class="chip">{who}</span></div>' if who else f'<div class="row" style="align-items:flex-start;gap:14px;padding:12px 16px;border-top:1px solid var(--ln)"><span class="mono" style="width:20px;color:var(--ink3);padding-top:3px">{i}</span>{mk}<div style="flex:1"><div class="t3">{t}</div><div class="sub">{s}</div></div></div>'
body = desk_side('inbox') + f"""
<main style="flex:1;min-width:0;padding:28px 36px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden">
  <div class="sub">Product / Launch dashboard</div>
  <div class="row"><h1 class="t1" style="flex:1">Activity</h1>{pill('wait', 'Waiting for approval')}<button class="btn sm">Export</button></div>
  <div class="row"><span class="chip on">Everything</span><span class="chip">Decisions</span><span class="chip">Steps</span><span class="chip">Checks</span></div>
  <div class="row" style="align-items:flex-start;gap:20px">
    <section class="card" style="flex:1.6;overflow:hidden">{''.join(evrow(i + 1, *e) for i, e in enumerate(ev)).replace('border-top:1px solid var(--ln)', 'border-top:1px solid var(--ln)', 1)}</section>
    <section class="col" style="flex:1;gap:14px">
      <div class="card" style="padding:12px 16px"><div class="kv"><span>Accountable owner</span><span>Priya</span></div><div class="kv"><span>Commented</span><span>Marcus</span></div><div class="kv"><span>Viewed</span><span>Lena</span></div><div class="kv"><span>Evidence</span><span>Checks report, source list</span></div></div>
      <div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:6px"><div class="lbl">About this log</div><div class="sub" style="line-height:1.5">Read only. It shows what happened and who decided. The agent's hidden reasoning is not recorded or shown, and delivery is a separate status from checks.</div></div>
    </section>
  </div>
</main>"""
board('Activity-Desktop.dc.html', 'Task activity on Mac', 1440, 900, body)
print('D done')
