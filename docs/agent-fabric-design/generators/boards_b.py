import re
from lib import *
from boards_a import av, ctl, a_bar

# ============ DARK (derived from the light boards so they stay in sync) ============
def dark_of(src, dst, title):
    s = open(f'{OUT}/{src}').read()
    s = re.sub(r':root\{[^}]*\}', ':root{' + DARK + '}', s, count=1)
    s = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', s, count=1)
    head, rest = s.split('</helmet>', 1)
    for a, b in {'#EBEEF3': '#131B23', '#DCE3F8': 'var(--ac2)', '#E9EDF2': 'var(--sf2)', '#F3F5F8': 'var(--bg)', '#FFFFFF': 'var(--sf)', '#E4E9FB': 'var(--ac2)', '#FBEBC8': 'var(--waitbg)', '#FADDDB': 'var(--badbg)', '#46515C': 'var(--idle)', '#EBD08F': '#5A4716', '#fff': 'var(--sf)'}.items():
        head = head.replace(a, b) if a != '#fff' else head
        rest = rest.replace(a, b) if a not in ('#fff',) else rest
    s = head.replace('--DARKTOKENS', '') + '</helmet>' + rest
    s = s.replace('</style>', '.pri{color:#0B1236 !important}.badge{color:#0B1236 !important}\n</style>', 1)
    open(f'{OUT}/{dst}', 'w').write(s)

dark_of('Home-Phone.dc.html', 'Home-Dark-Phone.dc.html', 'Home on iPhone, dark')
dark_of('Approval-Phone.dc.html', 'Approval-Dark-Phone.dc.html', 'Approval on iPhone, dark')
dark_of('Fleet-Desktop.dc.html', 'Fleet-Dark-Desktop.dc.html', 'Fleet Console on Mac, dark')

# ---- contrast tokens board (real ratios) ----
def lum(h):
    h = h.lstrip('#'); r, g, b = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= .03928 else ((c + .055) / 1.055) ** 2.4
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)
def cr(a, b):
    la, lb = lum(a), lum(b)
    if la < lb: la, lb = lb, la
    return (la + .05) / (lb + .05)
def parse(t): return dict(x.split(':') for x in t.split(';'))
L, D = parse(LIGHT.replace('--', '')), parse(DARK.replace('--', ''))
pairs = [('Body text', 'ink', 'sf'), ('Secondary text', 'ink3', 'sf'), ('Secondary text on page', 'ink3', 'bg'), ('Accent text', 'ac', 'sf'), ('Button label', 'onac', 'ac'), ('Selected chip', 'acd', 'ac2'),
         ('Running pill', 'acd', 'ac2'), ('Waiting pill', 'wait', 'waitbg'), ('Done pill', 'ok', 'okbg'), ('Failed pill', 'bad', 'badbg'), ('Idle pill', 'idle', 'idlebg')]
rows = ''
fails = []
for name, a, b in pairs:
    rl, rd = cr(L[a], L[b]), cr(D[a], D[b])
    okl, okd = rl >= 4.5, rd >= 4.5
    if not okl: fails.append((name, 'light', rl))
    if not okd: fails.append((name, 'dark', rd))
    rows += f'<div class="tr" style="grid-template-columns:1.4fr .8fr .8fr 1fr;padding:9px 16px"><span class="t3">{name}</span><span class="mono">{rl:.1f} : 1</span><span class="mono">{rd:.1f} : 1</span><span>{pill("ok","Pass") if okl and okd else pill("bad","Below 4.5")}</span></div>'
print('contrast fails:', fails)
def sw(k):
    return f'<div class="col" style="gap:4px;flex:1"><span style="height:44px;border-radius:8px;background:var(--{k});border:1px solid var(--ln)"></span><span class="sub" style="font-size:12px">{k}</span></div>'
sw_row = ''.join(sw(k) for k in ['bg', 'sf', 'sf2', 'ln', 'ink', 'ink3', 'ac', 'ac2', 'ok', 'wait', 'bad', 'idle'])
body = f"""
<main style="flex:1;padding:36px 44px 0;display:flex;flex-direction:column;gap:18px">
  <div class="row"><h1 class="t1" style="flex:1">Dark mode tokens</h1><span class="chip on">Same tokens, new values</span></div>
  <div class="sub" style="max-width:820px;line-height:1.5">Dark mode swaps the token values and nothing else. Status still uses a shape plus a word, never colour alone. The ratios below are measured from the actual token values.</div>
  <div class="card" style="padding:16px 18px"><div class="lbl" style="margin-bottom:8px">Dark palette</div><div class="row" style="gap:10px">{sw_row}</div></div>
  <div class="card" style="overflow:hidden"><div class="tr th" style="grid-template-columns:1.4fr .8fr .8fr 1fr"><span>Pair</span><span>Light</span><span>Dark</span><span>Result (4.5:1 for text)</span></div>{rows}</div>
</main>"""
board('Dark-Tokens.dc.html', 'Dark mode tokens', 1440, 900, body, dark=True)

# ============ SEARCH ============
def res(title, meta, right=''):
    return f'<div class="row" style="padding:10px 4px;min-height:52px"><div class="col" style="flex:1"><span class="t3">{title}</span><span class="sub">{meta}</span></div>{right}</div>'
body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:10px">
  <div class="row"><div class="card row" style="flex:1;height:44px;padding:0 14px;border-color:var(--ac);gap:8px">{ic('search')}<span style="font-weight:500">launch</span></div><span style="color:var(--ac);font-weight:600">Cancel</span></div>
  <div class="row"><span class="chip on">This Space</span><span class="chip">All Spaces</span></div>
  <div class="lbl" style="padding-top:6px">Tasks</div>
  <div class="card" style="padding:0 14px">{res('Launch dashboard', 'Product · Priya', pill('run', 'Running'))}</div>
  <div class="lbl" style="padding-top:6px">Files</div>
  <div class="card" style="padding:0 14px">{res('launch-requirements.md', 'Product files')}</div>
  <div class="lbl" style="padding-top:6px">Memories</div>
  <div class="card" style="padding:0 14px">{res('Launch review owners', 'Product', pill('ok', 'Saved here'))}</div>
  <div class="lbl" style="padding-top:6px">People</div>
  <div class="card" style="padding:0 14px">{res('Priya', 'Owner of Product')}</div>
  <div class="sub" style="padding:4px">Results only include what you can access in the chosen scope.</div>
</div>"""
board('Search-Phone.dc.html', 'Search on iPhone', 390, 844, body, direction='column')

def kc(t): return f'<span class="kc">{t}</span>'
KC = '.kc{display:inline-flex;min-width:24px;height:24px;padding:0 6px;border:1px solid var(--ln);border-bottom-width:2px;border-radius:6px;font:600 12px var(--font);align-items:center;justify-content:center;background:var(--sf);color:var(--ink2)}'
def prow(title, meta, on=False, right=''):
    return f'<div class="row" style="padding:9px 14px;border-radius:8px;{"background:var(--ac2)" if on else ""}"><span style="width:22px;color:var(--ink3)">{ic("files", 18)}</span><div class="col" style="flex:1"><span class="t3">{title}</span><span class="sub" style="font-size:12px">{meta}</span></div>{right}</div>'
body = desk_side('spaces') + f"""
<main style="flex:1;padding:28px 36px;display:flex;flex-direction:column;gap:16px"><span class="sk" style="height:30px;width:220px"></span><div class="row" style="gap:16px"><span class="sk" style="height:140px;flex:1;border-radius:12px"></span><span class="sk" style="height:140px;flex:1;border-radius:12px"></span><span class="sk" style="height:140px;flex:1;border-radius:12px"></span></div><span class="sk" style="height:260px;border-radius:12px"></span></main>
<div style="position:absolute;inset:0;background:rgba(10,16,22,.5)"></div>
<div class="card" style="position:absolute;left:360px;top:110px;width:720px;box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden">
  <div class="row" style="height:56px;padding:0 18px;border-bottom:1px solid var(--ln)">{ic('search')}<span style="font-size:16px;font-weight:500;flex:1">launch</span><span class="chip on">This Space</span><span class="chip">All Spaces</span></div>
  <div style="padding:8px"><div class="lbl" style="padding:8px 14px 4px">Tasks</div>{prow('Launch dashboard', 'Product · Priya', True, pill('run', 'Running'))}<div class="lbl" style="padding:10px 14px 4px">Files</div>{prow('launch-requirements.md', 'Product files')}<div class="lbl" style="padding:10px 14px 4px">Memories</div>{prow('Launch review owners', 'Product', False, pill('ok', 'Saved here'))}<div class="lbl" style="padding:10px 14px 4px">People</div>{prow('Priya', 'Owner of Product')}</div>
  <div class="row" style="height:44px;padding:0 18px;border-top:1px solid var(--ln);background:var(--sf2);gap:16px;font-size:12px;color:var(--ink3)"><span class="row" style="gap:6px">{kc('Enter')} Open</span><span class="row" style="gap:6px">{kc('Up')}{kc('Down')} Move</span><span class="row" style="gap:6px">{kc('Esc')} Close</span><span style="flex:1"></span><span>Only what you can access</span></div>
</div>"""
board('Search-Desktop.dc.html', 'Search on Mac', 1440, 900, body, KC)

# ============ NOTIFICATIONS ============
body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:10px">
  <div class="row" style="height:44px"><span style="color:var(--ac);font-weight:600;width:60px">Back</span><span class="t3" style="flex:1;text-align:center">Notifications</span><span style="width:60px"></span></div>
  <div class="lbl" style="padding:4px 4px 0">Needs you</div>
  <div class="card">{ctl('Approvals', 'When an action waits for your decision', True)}{ctl('Questions from the agent', 'When a task needs your answer', True)}{ctl('Waiting for budget', 'When a task pauses for budget', True)}</div>
  <div class="lbl" style="padding:8px 4px 0">Updates</div>
  <div class="card">{ctl('Task finished', 'Draft ready and checks complete', True)}{ctl('Task failed', 'When something could not finish', True)}{ctl('Automation results', 'Each scheduled run', False)}</div>
  <div class="lbl" style="padding:8px 4px 0">Delivery</div>
  <div class="card">{ctl('On the lock screen', 'Shows "Needs you" only, no details', val='Generic')}{ctl('Quiet hours', 'Only approvals break through', val='On')}</div>
</div>"""
board('Notifications-Phone.dc.html', 'Notification settings on iPhone', 390, 844, body, direction='column')

LOCK = """
.lk{background:linear-gradient(170deg,#243456 0%,#0E1620 70%)}
.nt{background:rgba(255,255,255,.16);border-radius:20px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;color:#fff}
"""
body = f"""
<div style="flex:1;padding:64px 16px 0;display:flex;flex-direction:column;gap:10px;color:#fff">
  <div class="row" style="gap:8px;justify-content:center;opacity:.85">{ic('lock', 18)}<span style="font-size:13px;font-weight:600">Locked</span></div>
  <span style="flex:1"></span>
  <div class="nt"><span style="width:36px;height:36px;border-radius:9px;background:var(--ac);color:var(--onac);font-weight:700;display:flex;align-items:center;justify-content:center;flex:none">A</span><div style="flex:1"><div class="row"><b style="flex:1">Agent Fabric</b><span style="font-size:12px;opacity:.8">now</span></div><div>Something needs you</div></div></div>
  <div class="nt"><span style="width:36px;height:36px;border-radius:9px;background:var(--ac);color:var(--onac);font-weight:700;display:flex;align-items:center;justify-content:center;flex:none">A</span><div style="flex:1"><div class="row"><b style="flex:1">Agent Fabric</b><span style="font-size:12px;opacity:.8">earlier</span></div><div>A task finished</div></div></div>
  <div style="text-align:center;font-size:13px;opacity:.85;padding:12px 24px 56px;line-height:1.45">Details appear after you unlock with Face ID. Nothing about the task, the Space or the people involved is shown here.</div>
</div>"""
board('Lockscreen-Phone.dc.html', 'Lock screen notifications on iPhone', 390, 844, body, LOCK, direction='column')
s = open(f'{OUT}/Lockscreen-Phone.dc.html').read().replace('class="af" style="width:390px', 'class="af lk" style="width:390px', 1)
open(f'{OUT}/Lockscreen-Phone.dc.html', 'w').write(s)

# ============ VOICE ============
bars = [10, 18, 30, 44, 26, 52, 36, 20, 46, 58, 30, 16, 40, 54, 28, 12, 34, 48, 22, 14]
wave = ''.join(f'<span style="width:5px;height:{h}px;border-radius:3px;background:var(--ac)"></span>' for h in bars)
body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:12px">
  <div class="row" style="height:44px"><span style="color:var(--ac);font-weight:600;width:60px">Cancel</span><span class="t3" style="flex:1;text-align:center">Voice</span><span style="width:60px"></span></div>
  <div class="seg"><span class="on">Ask</span><span>Plan</span><span>Act</span></div>
  <div class="card" style="padding:18px 16px;display:flex;flex-direction:column;align-items:center;gap:12px"><div class="row" style="gap:3px;height:64px">{wave}</div>{pill('run', 'Listening')}</div>
  <div class="card" style="padding:14px 16px"><div class="lbl">What I heard</div><div style="margin-top:6px;font-size:16px;line-height:1.5">Summarise the Q3 interview notes and flag any open questions for Priya.</div></div>
  <div class="row" style="padding:12px 14px;border-radius:12px;background:var(--sf2);color:var(--ink2);align-items:flex-start">{ic('eye')}<div style="line-height:1.45"><b>Check the text.</b> Speech can be misheard. Nothing is sent until you confirm.</div></div>
</div>
<div style="background:var(--sf);border-top:1px solid var(--ln);padding:12px 16px 34px;display:flex;flex-direction:column;gap:8px;flex:none">
  <button class="btn pri" style="width:100%">Send</button>
  <div class="row"><button class="btn" style="flex:1">Edit text</button><button class="btn" style="flex:1">Discard</button></div>
</div>"""
board('Voice-Phone.dc.html', 'Voice input on iPhone', 390, 844, body, direction='column')

# ============ ATTACH ============
def opt(icn, t):
    return f'<div class="col" style="align-items:center;gap:6px;flex:1"><span style="width:56px;height:56px;border-radius:16px;background:var(--sf2);display:flex;align-items:center;justify-content:center;color:var(--ink2)">{ic(icn, 24)}</span><span style="font-size:12px;font-weight:600">{t}</span></div>'
body = f"""
<div style="flex:1;padding:54px 16px 0;display:flex;flex-direction:column;gap:12px"><div class="row" style="height:44px"><span class="t3" style="flex:1;text-align:center">Product</span></div><span class="sk" style="height:60px;width:75%;border-radius:16px"></span><span class="sk" style="height:84px;width:85%;border-radius:16px;align-self:flex-end;background:var(--ac2)"></span><span class="sk" style="height:60px;width:65%;border-radius:16px"></span></div>
<div style="position:absolute;inset:0;background:rgba(10,16,22,.45)"></div>
<div style="position:absolute;left:0;right:0;bottom:0;background:var(--sf);border-radius:20px 20px 0 0;padding:10px 20px 36px;display:flex;flex-direction:column;gap:14px">
  <span style="width:40px;height:5px;border-radius:3px;background:var(--ln);align-self:center"></span>
  <div class="t2">Attach to this task</div>
  <div class="row" style="align-items:flex-start">{opt('image', 'Photos')}{opt('cam', 'Camera')}{opt('files', 'Files')}{opt('spaces', 'Space files')}</div>
  <div class="card row" style="padding:12px 14px;height:48px">{ic('link')}<span style="flex:1;font-weight:600">Add a link</span>{ic('chev', 18)}</div>
  <div class="sub" style="line-height:1.45">Attachments are available to this task only. They are not added to Knowledge unless you choose to save them.</div>
</div>"""
board('Attach-Phone.dc.html', 'Attachments on iPhone', 390, 844, body, direction='column')

# ============ ACCESSIBILITY ============
LT = """
.af{font-size:22px}
.t3{font-size:22px}.sub{font-size:19px}.lbl{font-size:15px}.pill{height:36px;font-size:18px;padding:0 14px;border-radius:18px}
.btn{height:64px;font-size:20px}
.tabi{height:84px;font-size:16px}
"""
body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:12px">
  <div class="row"><span class="chip on" style="height:34px;font-size:15px">Large text · 200%</span></div>
  <h1 class="t1" style="font-size:46px">Home</h1>
  <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px"><div>{pill('wait', 'Approval')}</div><div class="t3" style="font-size:26px;line-height:1.25">Make launch preview public</div><div class="sub">Dashboard prototype · Priya</div><button class="btn pri" style="width:100%">Review</button></div>
  <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px"><div>{pill('run', 'Running')}</div><div class="t3" style="font-size:26px;line-height:1.25">Launch dashboard</div><div class="sub">Drafting layout</div></div>
  <div class="sub" style="padding:0 4px">2 more items. Text wraps instead of truncating, and buttons stack full width.</div>
</div>
<nav aria-label="Primary" style="display:flex;background:var(--sf);border-top:1px solid var(--ln);padding:6px 8px 30px;flex:none"><a class="tabi on">{ic('home', 28)}Home</a><a class="tabi">{ic('spaces', 28)}Spaces</a><a class="tabi">{ic('inbox', 28)}Inbox</a></nav>"""
board('A11y-Phone.dc.html', 'Large text on iPhone', 390, 844, body, LT, direction='column')

FOCUS = KC + ".fc{outline:3px solid var(--ac);outline-offset:2px}"
sc = [('New task', ['Cmd', 'N']), ('Search', ['Cmd', 'K']), ('Send message', ['Cmd', 'Enter']), ('Stop the selected task', ['Cmd', '.']), ('Open Inbox', ['Cmd', '2']), ('Close panel or sheet', ['Esc']), ('Next control', ['Tab']), ('Previous control', ['Shift', 'Tab'])]
sc_html = ''.join(f'<div class="row" style="padding:9px 0;border-top:1px solid var(--ln)"><span style="flex:1">{n}</span><span class="row" style="gap:4px">' + ''.join(kc(k) for k in ks) + '</span></div>' for n, ks in sc)
body = desk_side('spaces') + f"""
<main style="flex:1;min-width:0;padding:28px 36px 0;display:flex;flex-direction:column;gap:16px;overflow:hidden">
  <div class="row"><h1 class="t1" style="flex:1">Accessibility and keyboard</h1><span class="chip on">Mac, Windows, iPad keyboard</span></div>
  <div class="row" style="align-items:flex-start;gap:20px">
    <section class="col" style="flex:1;gap:16px">
      <div class="card" style="padding:16px 18px"><div class="t2">Focus is always visible</div><div class="sub" style="margin:4px 0 14px;line-height:1.5">A 3 px ring with a gap sits on whichever control has focus. It never relies on a colour change alone.</div><div class="row" style="gap:14px"><button class="btn pri fc">Approve</button><button class="btn">Decline</button><span class="chip">Tab moves right</span></div></div>
      <div class="card" style="padding:16px 18px"><div class="t2">Status uses shape and a word</div><div class="sub" style="margin:4px 0 12px">Never colour alone.</div><div class="row" style="flex-wrap:wrap;gap:8px">{pill('run', 'Running')}{pill('wait', 'Waiting')}{pill('ok', 'Done')}{pill('bad', 'Failed')}{pill('idle', 'Idle')}</div></div>
      <div class="card" style="padding:16px 18px"><div class="t2">Reduced motion</div><div class="row" style="gap:16px;margin-top:10px;align-items:stretch"><div class="card col" style="flex:1;padding:12px;gap:6px"><span class="lbl">Motion on</span><div class="row"><span class="mk" style="width:18px;height:18px;border:3px solid var(--ac2);border-top-color:var(--ac)"></span><span>Working</span></div><span class="sub">Indicator spins</span></div><div class="card col" style="flex:1;padding:12px;gap:6px"><span class="lbl">Reduced motion</span><div class="row">{pill('run', 'Working')}</div><span class="sub">Static shape and a word</span></div></div></div>
    </section>
    <section class="card" style="flex:1;padding:16px 18px"><div class="t2" style="margin-bottom:6px">Shortcuts</div>{sc_html}<div class="sub" style="margin-top:10px;line-height:1.5">Every action also has a visible button. Shortcuts speed things up and are never the only way. Windows uses Ctrl in place of Cmd.</div></section>
  </div>
</main>"""
board('A11y-Desktop.dc.html', 'Accessibility and keyboard on Mac', 1440, 900, body, FOCUS)

# ============ ERROR / DENIED / LOADING ============
body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:12px">
  <div class="row" style="height:44px"><span style="color:var(--ac);font-weight:600;width:60px">Task</span><span class="t3" style="flex:1;text-align:center">Problem</span><span style="width:60px"></span></div>
  <div>{pill('bad', 'Couldn\'t finish')}<h1 class="t2" style="font-size:20px;margin-top:8px">Vendor SOC 2 summary</h1></div>
  <div class="card" style="padding:12px 14px"><div class="lbl">What happened</div><div style="margin-top:4px;line-height:1.45">The data source stopped responding partway through the documents. The task paused at a safe point.</div></div>
  <div class="card" style="padding:12px 14px"><div class="lbl">What is saved</div><div class="li" style="margin-top:4px">{tick()}<span>Partial summary and your files</span></div><div class="li">{tick()}<span>Nothing was published or sent</span></div></div>
  <div class="sub mono" style="padding:0 4px">Reference a91f…3c</div>
</div>
<div style="background:var(--sf);border-top:1px solid var(--ln);padding:12px 16px 34px;display:flex;flex-direction:column;gap:8px;flex:none">
  <button class="btn pri" style="width:100%">Retry from the last step</button>
  <div class="row"><button class="btn" style="flex:1">Open partial result</button><button class="btn" style="flex:1">Report a problem</button></div>
</div>"""
board('Error-Phone.dc.html', 'Task failed on iPhone', 390, 844, body, direction='column')

body = f"""
<div style="flex:1;overflow:hidden;padding:54px 24px 0;display:flex;flex-direction:column;gap:14px;align-items:center">
  <div class="row" style="height:44px;align-self:stretch"><span style="color:var(--ac);font-weight:600">Spaces</span></div>
  <span style="margin-top:36px;width:72px;height:72px;border-radius:36px;background:var(--sf2);color:var(--ink2);display:flex;align-items:center;justify-content:center">{ic('lock', 32)}</span>
  <h1 class="t1" style="font-size:26px;text-align:center">You can't open this Space</h1>
  <div style="text-align:center;color:var(--ink2);line-height:1.5;font-size:15px">Platform ops is shared with specific people and you are not on its member list. What is inside is not shown.</div>
  <div class="card" style="padding:12px 16px;align-self:stretch;margin-top:10px"><div class="lbl">Who can let you in</div><div class="row" style="margin-top:8px">{av('RV')}<div class="col"><span class="t3">Ravi</span><span class="sub">Space owner</span></div></div></div>
  <div class="sub" style="text-align:center;line-height:1.45">Your request goes to the Space owner. You will see the answer in Inbox.</div>
</div>
<div style="padding:12px 24px 34px;display:flex;flex-direction:column;gap:8px;flex:none"><button class="btn pri" style="width:100%">Request access</button><a href="Spaces-Phone.dc.html" class="btn ghost" style="width:100%">Back to Spaces</a></div>"""
board('Denied-Phone.dc.html', 'Permission denied on iPhone', 390, 844, body, direction='column')

body = f"""
<div style="flex:1;overflow:hidden;padding:54px 16px 0;display:flex;flex-direction:column;gap:12px" role="status" aria-label="Loading Product">
  <div class="row" style="height:44px"><span class="sk" style="height:20px;width:60px"></span><span style="flex:1"></span><span class="sk" style="height:20px;width:90px"></span><span style="flex:1"></span><span class="sk" style="height:20px;width:40px"></span></div>
  <div class="row" style="padding:12px 14px;border-radius:12px;background:var(--idlebg);align-items:flex-start">{ic('wifioff')}<div style="line-height:1.4"><b>Taking longer than usual.</b><br><span style="color:var(--ink2)">Your connection may be slow. Nothing is lost.</span></div></div>
  <span class="sk" style="height:56px;width:70%;border-radius:16px"></span>
  <span class="sk" style="height:96px;width:85%;border-radius:16px;align-self:flex-end"></span>
  <span class="sk" style="height:56px;width:60%;border-radius:16px"></span>
  <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><span class="sk" style="height:16px;width:50%"></span><span class="sk" style="height:12px;width:90%"></span><span class="sk" style="height:12px;width:70%"></span></div>
  <span style="flex:1"></span>
  <button class="btn" style="width:100%">Try again</button>
  <div class="sub" style="text-align:center;padding-bottom:30px">Loading Product…</div>
</div>"""
board('Loading-Phone.dc.html', 'Loading on iPhone', 390, 844, body, direction='column')
print('B done')
