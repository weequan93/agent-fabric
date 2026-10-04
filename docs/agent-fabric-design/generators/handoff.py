import json,re,sys,os
HH=int(os.environ.get('H',4380))
sys.path.insert(0,'.')
from lib import *
P='../project/'
c=json.load(open(P+'canvas.json')); B=c['boards']
def tok(s): return dict(re.findall(r'--(\w+):(#[0-9A-Fa-f]{6})',s))
L,D=tok(LIGHT),tok(DARK)
def lum(h):
    r,g,b=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    f=lambda v:v/12.92 if v<=.03928 else ((v+.055)/1.055)**2.4
    return .2126*f(r)+.7152*f(g)+.0722*f(b)
def cr(a,b):
    x,y=sorted([lum(a),lum(b)],reverse=True); return (x+.05)/(y+.05)
NAME={'bg':'Canvas','sf':'Surface','sf2':'Surface raised','ln':'Line','ink':'Text','ink2':'Text secondary','ink3':'Text tertiary','ac':'Accent','ac2':'Accent tint','acd':'Accent text','wait':'Waiting text','waitbg':'Waiting fill','ok':'Done text','okbg':'Done fill','bad':'Problem text','badbg':'Problem fill','idle':'Idle text','idlebg':'Idle fill','onac':'On accent'}
def sw(h): return f'<span style="width:28px;height:28px;border-radius:6px;background:{h};border:1px solid rgba(128,128,128,.4);flex:none"></span>'
rows=''.join(f'<div class="tk"><span class="t3" style="width:150px">{NAME[k]}</span><span class="mono" style="width:70px;color:var(--ink3)">--{k}</span>{sw(L[k])}<span class="mono" style="width:70px">{L[k]}</span>{sw(D[k])}<span class="mono">{D[k]}</span></div>' for k in NAME)
pairs=[('Text on canvas','ink','bg'),('Secondary on canvas','ink2','bg'),('Tertiary on surface','ink3','sf'),('Accent text on tint','acd','ac2'),('On accent button','onac','ac'),('Waiting text on fill','wait','waitbg'),('Done text on fill','ok','okbg'),('Problem text on fill','bad','badbg'),('Idle text on fill','idle','idlebg')]
crow=''.join(f'<div class="tk"><span style="flex:1">{n}</span><span class="mono" style="width:72px">{cr(L[a],L[b]):.1f} : 1</span><span class="mono" style="width:72px">{cr(D[a],D[b]):.1f} : 1</span></div>' for n,a,b in pairs)
def has(stem,plat): return f'{stem}-{plat}.dc.html' in B
PL=[('iPhone','Phone'),('iPad','Tablet'),('Mac','Desktop'),('Win','Windows'),('Android','Android')]
def links(stems):
    out=[]
    for st in stems:
        if any(has(st,p) for _,p in PL): out.append(f'<span class="sub" style="font-size:12px;font-weight:600;margin:0 2px 0 8px">{st}</span>')
        if f'{st}.dc.html' in B: out.append(f'<a href="{st}.dc.html" class="mp">{st}</a>')
        for lab,p in PL:
            if has(st,p): out.append(f'<a href="{st}-{p}.dc.html" class="mp">{lab}</a>')
    return ''.join(out)
COV=[('Spaces, conversations, invites','Space, conversation and task are separate things. Opening a Space never moves a running task.',['Spaces','Conversations','NewSpace','Invite']),
('Intent control','Ask, Plan, Act choose what a message may do. They are not authority levels.',['Home','Chat','Plan']),
('Envelope and preflight','Scope, resources and cost are shown before anything runs.',['Envelope','Startup']),
('Approvals','Bound to an exact version, with expiry. Any change cancels it.',['Approval','Inbox']),
('Draft, checks, delivery','Three separate statuses. Delivery can be Outcome unknown.',['Task','Delivery','Recovery']),
('Stop, archive, delete','Stop works from a stale view. Delete is a reviewed multi-step process.',['Stop','DeleteSpace']),
('Memory and methods','Saved here, Pending review, Not saved. Reflect can be Inconclusive.',['Memory','MemoryReview','Methods']),
('Runtime and rollout','Software-only assurance is stated plainly. Rollout and rollback are one action.',['Runtime','Rollout','Setup']),
('Revocation, export, share','Strict revocation. Live reference differs from a published copy.',['Revoke','Export','Share']),
('Computer, takeover, sign-in','Isolated sensitive sign-in. Takeover pauses the agent.',['Computer','Takeover','Sensitive']),
('Budget and cost','Waiting for budget is a state with two clear choices.',['Budget','Cost']),
('Automations and fleet','Scheduled runs as a service identity. Fleet alerts for admins.',['Automation','Fleet','Devices','Policy']),
('Offline, errors, session','Never claim more than is known. Drafts are kept offline.',['Offline','Error','SessionExpired','Denied','Conflict','Loading']),
('Notifications, search, voice','Lock screen says Needs you, not what for. Voice is confirmed before sending.',['Notifications','Lockscreen','Search','Voice','Attach']),
('Accessibility and dark mode','Contrast measured from real values. Never colour alone.',['A11y','Shortcuts','Dark-Tokens'])]
cov=''.join(f'<div class="card" style="padding:14px 18px;display:grid;grid-template-columns:200px 1fr 520px;gap:20px;align-items:center"><span class="t3">{a}</span><span class="sub">{b}</span><span style="display:flex;flex-wrap:wrap;gap:6px">{links(s) or "".join(f"<a href={x}.dc.html class=mp>{x}</a>" for x in s if f"{x}.dc.html" in B)}</span></div>' for a,b,s in COV)
LAYOUT=[('iPhone','Compact','Bottom tab bar: Home, Spaces, Inbox. Full-screen pages, sheets for decisions. Landscape keeps tabs.','10–12 px radii. Face ID.'),
('iPad','Medium and Expanded','Left rail (92 px). Master-detail in landscape, single column in portrait. Slide Over and Split View collapse to Compact.','Sheets for decisions. Touch ID or Face ID.'),
('Mac','Expanded','232 px sidebar, content area, optional right inspector. Related-screens strip at the foot. Narrow window collapses the sidebar.','Sheets over the window. Touch ID. Keyboard shortcuts shown.'),
('Windows','Expanded','Title bar with caption buttons, left navigation pane with accent bar. Decisions open as a docked right pane. Mac screens carry over with this frame; windows are 1440 by 932.','4 px radii, Segoe UI. Windows Hello. Alt menu bar, tray flyout and toasts. Keyboard focus rings.'),
('Android','Compact (Medium on fold and tablet)','Material bottom navigation (80 px); navigation rail and list-detail on tablets and foldables; tonal surfaces, pill buttons, modal bottom sheet for decisions, extended FAB for the primary action.','24 px button radius, 16 px cards. Fingerprint or face unlock. Predictive back.')]
lay=''.join(f'<div class="card" style="padding:14px 18px;display:grid;grid-template-columns:110px 190px 1fr 340px;gap:20px;align-items:start"><span class="t3">{a}</span><span class="sub">{b}</span><span>{c_}</span><span class="sub">{d}</span></div>' for a,b,c_,d in LAYOUT)
import glob
NIX=sum(1 for f in glob.glob(P+'*.dc.html') if 'onClick=' in open(f).read())
comp=''.join(f'<div class="card" style="padding:14px 18px;display:grid;grid-template-columns:190px 1fr;gap:20px;align-items:center"><span class="t3">{a}</span><span>{b}</span></div>' for a,b in [
 ('Status pill',pill('run','Running')+' '+pill('wait','Waiting')+' '+pill('ok','Done')+' '+pill('bad','Failed')+' '+pill('idle','Not started')+'<div class="sub" style="margin-top:6px">Shape plus a word, never colour alone. Round: running. Hollow square: waiting. Square: done. Diamond: problem. Dash: idle.</div>'),
 ('Buttons','<span class="btn pri">Primary</span> <span class="btn">Secondary</span> <span class="btn dng">Destructive</span><div class="sub" style="margin-top:6px">One primary per view. Destructive is outlined, never filled. Disabled shows why.</div>'),
 ('Card and row','<span class="sub">Cards group one decision. Rows are label left, value right, hairline between. Minimum row height 44 px (48 on Android).</span>'),
 ('Sheet, pane, dialog','<span class="sub">Decisions open as a sheet (iPhone, iPad, Mac), a docked pane (Windows) or a bottom sheet (Android). The dimmed background closes it.</span>'),
 ('Interactions',f'<span class="sub">Playable on {NIX} boards: toggles, option pickers, Ask/Plan/Act, Approve and Decline with Undo. Links join the rest. Every board also has a Light / Dark switch. Boards marked with the blue Play mark are interactive.</span>')])
body=f'''<main style="flex:1;padding:56px 64px 56px;display:flex;flex-direction:column;gap:30px">
<div><div class="lbl">Agent Fabric · handoff</div><h1 class="t1" style="font-size:40px;margin-top:6px">Handoff notes</h1><p class="sub" style="font-size:16px;max-width:820px;line-height:1.5;margin:10px 0 0">What engineers need from this canvas: tokens, layout rules per device, components, and where each part of the product spec is designed. <a href="Start-Here.dc.html" style="color:var(--ac);font-weight:600">Start here</a> has the click-through flows.</p></div>
<section><div class="lbl" style="margin-bottom:10px">Tokens · light and dark</div><div class="card" style="padding:8px 20px"><div class="tk" style="color:var(--ink3);font-size:12px;font-weight:600"><span style="width:150px">Role</span><span style="width:70px">Variable</span><span style="width:98px">Light</span><span>Dark</span></div>{rows}</div></section>
<section><div class="lbl" style="margin-bottom:10px">Measured contrast (WCAG ratio, light and dark)</div><div class="card" style="padding:8px 20px"><div class="tk" style="color:var(--ink3);font-size:12px;font-weight:600"><span style="flex:1">Pair</span><span style="width:72px">Light</span><span style="width:72px">Dark</span></div>{crow}</div><div class="sub" style="margin-top:8px">Body text needs 4.5 : 1. Large text and icons need 3 : 1. Every pair above passes.</div></section>
<section><div class="lbl" style="margin-bottom:10px">Type, space and shape</div><div class="card" style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px"><div><div class="t3">Type</div><div class="sub" style="line-height:1.6">Hanken Grotesk on iPhone, iPad, Mac and Android (Roboto fallback). Segoe UI Variable on Windows. IBM Plex Mono for digests and ids. Sizes: 11 caps label, 13 secondary, 14 body, 16 section, 22–28 title, 32–40 page.</div></div><div><div class="t3">Space</div><div class="sub" style="line-height:1.6">4-point scale: 4, 8, 12, 16, 20, 24, 32. Page gutter 16 (phone), 20–28 (tablet), 36 (desktop). Touch targets 44 px minimum, 48 on Android.</div></div><div><div class="t3">Shape</div><div class="sub" style="line-height:1.6">iPhone, iPad and Mac: 10 px controls, 12 px cards. Android: 24 px buttons, 16 px cards, 28 px sheets. Windows: 4 px controls, 8 px cards. Status pills use a 12 px (4 px on Windows) radius.</div></div></div></section>
<section><div class="lbl" style="margin-bottom:10px">Layout and platform conventions</div><div style="display:flex;flex-direction:column;gap:8px">{lay}</div></section>
<section><div class="lbl" style="margin-bottom:10px">Components</div><div style="display:flex;flex-direction:column;gap:8px">{comp}</div></section>
<section><div class="lbl" style="margin-bottom:10px">Spec coverage · where each part is designed</div><div style="display:flex;flex-direction:column;gap:8px">{cov}</div></section>
<section><div class="lbl" style="margin-bottom:10px">Assumptions to confirm</div><div class="card" style="padding:14px 20px;line-height:1.7">The runtime could not be exercised in the design tool itself, so interactions were checked by rendering every state. Dark mode is a token swap: every board has a Light / Dark switch at its top edge, and fixed dark copies of the main screens sit beside the light ones. Windows boards use Fluent controls (NavigationView, ContentDialog, toggles, Windows Hello) and Android boards use Material 3 controls (top app bar, pill buttons, switches, bottom and side sheets); a few secondary screens still reuse the iPhone or Mac layout inside each platform's shell. Copy such as costs, names and times is sample data.</div></section>
</main>'''
css='''.tk{display:flex;align-items:center;gap:14px;min-height:40px;padding:4px 0;border-top:1px solid var(--ln);font-size:13px}.tk:first-child{border-top:0}
.mp{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:8px;background:var(--sf2);font-size:12px;font-weight:600;color:var(--acd)}.mp:hover{background:var(--ac2)}'''
board('Handoff-Notes.dc.html','Handoff notes',1440,HH,body,css,direction='column')
c=json.load(open(P+'canvas.json'))
c['boards']['Handoff-Notes.dc.html']={'x':1560,'y':-HH-420,'w':1440,'h':HH,'title':'Handoff notes','is_interactive':True}
c['notes']['r_handoff']={'x':1560,'y':-HH-720,'text':'Handoff notes','kind':'title1','maxW':1440}
if 'Handoff-Notes.dc.html' not in c['order']: c['order'].insert(1,'Handoff-Notes.dc.html')
json.dump(c,open(P+'canvas.json','w'),indent=1)
print('ok')
