import json,re,sys
sys.path.insert(0,'.')
from lib import *
P='../project/'
c=json.load(open(P+'canvas.json'))
B=c['boards']
def t(fn): return B[fn+'.dc.html']['title']
DEV={'iPhone','iPad portrait','iPad','Mac','Windows','Android phone','iPad landscape'}
def short(fn):
    h,_,tl=t(fn).rpartition(' - ')
    return h if h and tl in DEV else t(fn)
def link(fn,label=None,n=None):
    lab=label or short(fn)
    num=f'<span class="n">{n}</span>' if n else ''
    return f'<a href="{fn}.dc.html" class="lk">{num}<span>{lab}</span></a>'
FLOWS=[
 ('Ask, approve, deliver · iPhone','From a question to a delivered result',[('Home-Phone','Home'),('Chat-Phone','Space chat'),('Envelope-Phone','Task envelope'),('Startup-Phone','Computer startup'),('Approval-Phone','Approval'),('Task-Phone','Task result'),('Delivery-Phone','Delivery')]),
 ('Stop, take over, recover · iPhone','When something must be halted or checked',[('Task-Phone','Task result'),('Stop-Phone','Stop result'),('Recovery-Phone','Recovery'),('Computer-Phone','Computer'),('Takeover-Phone','Takeover'),('Sensitive-Phone','Sensitive sign-in')]),
 ('First run and access · iPhone','Setting up, signing in, limits',[('Onboarding-Phone','First run'),('Home-Phone','Home'),('Empty-Phone','Nothing here yet'),('Denied-Phone','No access'),('Offline-Phone','Offline'),('SessionExpired-Phone','Session expired')]),
 ('Spaces and memory · iPhone','Where work lives and what is remembered',[('Spaces-Phone','Spaces'),('Conversations-Phone','Conversations'),('Chat-Phone','Space chat'),('Memory-Phone','Memory'),('MemoryReview-Phone','Memory review'),('Settings-Phone','Settings')]),
 ('Share and publish · iPhone','Moving a result out of the Space',[('Task-Phone','Task result'),('Share-Phone','Share to a Space'),('Export-Phone','Export and publish'),('Design-Phone','Design Studio')]),
 ('Administer · Mac','Policy, runtime, rollout and lifecycle',[('Setup-Desktop','Setup'),('Policy-Desktop','Policy and grants'),('Runtime-Desktop','Runtime qualification'),('Rollout-Desktop','Rollout'),('Revoke-Desktop','Revoke access'),('DeleteSpace-Desktop','Delete a Space')]),
]
FLOWS+=[('Ask, approve, deliver · Windows','The same journey with a docked approval pane and Windows Hello',[('Windows-Desktop','Home'),('Chat-Windows','Space chat'),('Envelope-Windows','Task envelope'),('Startup-Windows','Computer startup'),('Approval-Windows','Approval'),('Task-Windows','Task result'),('Delivery-Windows','Delivery')]),
 ('Ask, approve, deliver · Android','The same journey with bottom sheets and fingerprint approval',[('Android-Phone','Home'),('Chat-Android','Space chat'),('Envelope-Android','Task envelope'),('Approval-Android','Approval'),('Task-Android','Task result'),('Delivery-Android','Delivery')]),
 ('Fleet, cost and policy · Mac','What an administrator watches and controls',[('Fleet-Desktop','Fleet Console'),('Cost-Desktop','Cost'),('Policy-Desktop','Policy and grants'),('Devices-Desktop','Devices'),('Automation-Desktop','Automations'),('Activity-Desktop','Activity')])]
PLATS=[('iPhone','Phone','Home-Phone'),('iPad','Tablet','Home-Tablet'),('Mac','Desktop','Home-Desktop'),('Windows','Windows','Windows-Desktop'),('Android phone','Android','Android-Phone')]
used=set()
html=['<main style="flex:1;padding:56px 64px 48px;display:flex;flex-direction:column;gap:32px">',
 '<div><div class="lbl">Agent Fabric · all devices</div><h1 class="t1" style="font-size:40px;margin-top:6px">Start here</h1><p class="sub" style="font-size:16px;max-width:760px;line-height:1.5;margin:10px 0 0">One system on iPhone, iPad, Mac, Windows and Android. Click any step to open that screen. Links stay on the same device wherever that screen exists. Every board has a Light / Dark switch at its top edge; the Dark mode list below holds fixed dark copies of the main screens.</p></div>',
 '<div><div class="lbl" style="margin-bottom:12px">Pick a device</div><div style="display:flex;gap:12px">'+''.join(f'<a href="{h}.dc.html" class="card dev"><span class="t2">{n}</span><span class="sub">Open Home</span></a>' for n,_,h in PLATS)+'</div></div>',
 '<div><div class="lbl" style="margin-bottom:12px">Flows</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">']
for name,desc,steps in FLOWS:
    html.append(f'<div class="card" style="padding:18px 20px"><div class="t2">{name}</div><div class="sub" style="margin-bottom:12px">{desc}</div><div class="steps">'+''.join(link(f,l,i+1) for i,(f,l) in enumerate(steps))+'</div></div>')
    used.update(f for f,_ in steps)
html.append('</div></div>')
SPEC=[('Dark mode',['Home-Dark-Phone','Chat-Dark-Phone','Approval-Dark-Phone','Settings-Dark-Phone','Android-Dark-Phone','Inbox-Dark-Desktop','Design-Dark-Desktop','Fleet-Dark-Desktop','Home-Dark-Tablet','Chat-Dark-Tablet','Approval-Dark-Tablet','Home-Dark-Desktop','Chat-Dark-Desktop','Approval-Dark-Desktop','Home-Dark-Windows','Chat-Dark-Windows','Approval-Dark-Windows','Approval-Dark-Android','Chat-Dark-Android','Inbox-Dark-Android','Spaces-Dark-Android','Settings-Dark-Android','Task-Dark-Android','Delivery-Dark-Android','Envelope-Dark-Android','Android-Dark-Tablet','Fold-Dark-Android','Home-Dark-SplitView','Home-Dark-SlideOver','Home-Dark-NarrowWindow','Chat-Landscape-Dark-Android','Approval-Landscape-Dark-Android','Approval-Dark-AndroidTablet','Chat-Dark-AndroidTablet','Spaces-Dark-Windows','Work-Dark-Windows','Computer-Dark-Windows','Search-Dark-Windows','Shortcuts-Dark-Windows','Search-Dark-Tablet','Notifications-Dark-Tablet','Empty-Dark-Tablet','Offline-Dark-Android','Empty-Dark-Android','Onboarding-Dark-Android','Automation-Dark-Android','Design-Dark-Android','Methods-Dark-Android','Dark-Tokens']),
 ('Window sizes and orientations',['Home-SlideOver','Home-SplitView','Home-NarrowWindow','Chat-Landscape-Phone','Fold-Android','Android-Tablet','Approval-AndroidTablet','Chat-AndroidTablet','Chat-Landscape-Android','Approval-Landscape-Android']),
 ('Foundations and handoff',['Main','Layouts','Handoff-Notes','Shortcuts-Desktop','Shortcuts-Windows'])]
html.append('<div style="display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:16px">')
for n,fs in SPEC:
    html.append(f'<div class="card" style="padding:18px 20px"><div class="t2" style="margin-bottom:10px">{n}</div><div class="steps">'+''.join(link(f) if f+'.dc.html' in B else '' for f in fs)+'</div></div>')
    used.update(fs)
html.append('</div>')
LS=sorted(k[:-8] for k in B if k.endswith('-TabletLandscape.dc.html'))
html.append('<div class="card" style="padding:18px 20px"><div class="t2" style="margin-bottom:4px">iPad landscape - decisions and tasks as sheets</div><div class="sub" style="margin-bottom:12px">Each opens over Inbox on a 1194 by 834 screen. The sheet is 520 px wide.</div><div class="steps">'+''.join(link(f) for f in LS)+'</div></div>')
used.update(LS)
# directory
names=[('iPhone','Phone'),('iPad','Tablet'),('Mac','Desktop'),('Windows','Windows'),('Android','Android')]
html.append('<div><div class="lbl" style="margin-bottom:12px">Every screen by device</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px">')
for n,suf in names:
    items=sorted(k[:-8] for k in B if k[:-8].endswith('-'+suf) and 'Dark' not in k and k[:-8] not in ('Home-SlideOver','Home-SplitView','Home-NarrowWindow'))
    html.append(f'<div class="card" style="padding:14px 16px"><div class="t3" style="margin-bottom:8px">{n} · {len(items)}</div>'+''.join(f'<a href="{f}.dc.html" class="dl">{short(f)}</a>' for f in items)+'</div>')
html.append('</div></div></main>')
css='''.lk{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:10px;background:var(--sf2);font-weight:600;font-size:14px}
.lk .n{width:22px;height:22px;border-radius:11px;background:var(--ac2);color:var(--acd);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.steps{display:flex;flex-wrap:wrap;gap:8px}
.dev{display:flex;flex-direction:column;gap:2px;padding:16px 18px;flex:1}
.dl{display:block;font-size:13px;padding:5px 0;color:var(--ink2);border-top:1px solid var(--ln)}.dl:first-of-type{border-top:0}
a.lk:hover,a.dev:hover{border-color:var(--ac)}'''
maxlen=max(len([k for k in B if k[:-8].endswith('-'+suf) and 'Dark' not in k]) for _,suf in names)
import os
H=int(os.environ.get('H',0)) or (1920+maxlen*31)
board('Start-Here.dc.html','Start here',1440,H,'\n'.join(html),css,direction='column')
c=json.load(open(P+'canvas.json'))
c['boards']['Start-Here.dc.html']={'x':0,'y':-H-420,'w':1440,'h':H,'title':'Start here','is_interactive':True}
c['notes']['r_start']={'x':0,'y':-H-720,'text':'Start here','kind':'title1','maxW':1440}
if 'Start-Here.dc.html' not in c['order']: c['order'].insert(0,'Start-Here.dc.html')
c['launch']={'view':'canvas'}
json.dump(c,open(P+'canvas.json','w'),indent=1)
print('H',H)
