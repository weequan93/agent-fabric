import re,glob,os,json
P='../project/'
exist={os.path.basename(f)[:-8] for f in glob.glob(P+'*.dc.html')}
PLAT={'Phone','Tablet','Desktop','Android','Windows'}
def split(n):
    parts=n.split('-')
    plat=parts[-1] if parts[-1] in PLAT else None
    stem='-'.join(p for p in parts[:-1] if p!='Dark') if plat else n
    return stem,plat
# rules: stem -> {label: target stem}
R={
'Chat':{'Start':'Envelope','Edit':'Plan','Start task':'Envelope','Edit details':'Plan','Open task':'Activity','Stop':'Stop','Stop task':'Stop'},
'Home':{'New task':'Chat','Review action':'Inbox','Clarify':'Inbox','Add budget':'Cost','Open':'Activity','Stop':'Stop'},
'Plan':{'Start as task (Act)':'Envelope','Revise plan':'Chat','Back':'Chat'},
'Startup':{'Stop this task':'Stop'},
'Approval':{'Inbox':'Inbox','Approve with Face ID':'Delivery','Ask for changes':'Chat','Decline':'Inbox'},
'Inbox':{'Review action':'Approval','Open task':'Task','Clarify':'Chat','Add budget':'Budget','Reduce scope':'Plan'},
'Budget':{'Inbox':'Inbox','Request budget':'Inbox','Stop the task instead':'Stop'},
'Delivery':{'Task':'Task','Check status':'Recovery','Open task':'Task'},
'Task':{'Work':'Chat','Open in Design Studio':'Design','Share to Space':'Share','Publish externally…':'Export'},
'Stop':{'Task':'Task','Review external actions':'Recovery','Done':'Home'},
'Computer':{'Take over screen':'Takeover','Stop this task':'Stop','Back to Spaces':'Spaces'},
'Takeover':{'Return to agent':'Computer','End takeover':'Computer'},
'Denied':{'Request access':'Inbox','Back to Spaces':'Spaces'},
'Error':{'Retry from the last step':'Task','Open partial result':'Task','Report a problem':'Settings'},
'Export':{'Share live reference':'Share','Review published copy':'Task'},
'Share':{'Cancel':'Task','Share capsule to Product':'Task','Keep private':'Task'},
'Onboarding':{'Ask your first question':'Home','Skip for now':'Home'},
'Sensitive':{'Continue to sign in':'Computer','Cancel and keep the task paused':'Inbox'},
'SessionExpired':{'Sign in with your organization':'Home'},
'Conflict':{'Review both':'Chat'},
'MemoryReview':{'Accept':'Memory','Edit':'Memory','Not now':'Memory'},
'Methods':{'Back':'Settings'},
'NewSpace':{'Create Space':'Spaces'},
'Invite':{'Send 2 invitations':'Spaces'},
'Recovery':{'Check status of #launch post':'Task','Open Inbox':'Inbox'},
'Empty':{'Attach a file':'Attach','Ask your admin':'Denied','Update the app':'Settings'},
'Loading':{'Try again':'Home'},
'Fleet':{'Home':'Home','Open remediation':'Computer','Open task':'Task','Acknowledge':'Home'},
'Design':{'Files':'Files','Accept version 4':'Task','Share to Space':'Share','Publish externally…':'Export'},
'Automation':{'Cancel':'Settings','Run a test':'Task','Activate':'Settings'},
'Account':{'Sign out':'SessionExpired'},
'Fold':{'Open task':'Task'},
'Android':{'New task':'Chat'},
'Voice':{'Send':'Chat','Edit text':'Chat','Discard':'Chat'},
}
ALIAS={'Home':{'Android':'Android-Phone','Windows':'Windows-Desktop'}}
def resolve(stem,plat):
    for cand in ([f'{stem}-{plat}'] if plat else [])+[f'{stem}-Phone']:
        if ALIAS.get(stem,{}).get(plat) in exist: return ALIAS[stem][plat]
        if cand in exist: return cand
    return None
NAV={'Home':'Home','Spaces':'Spaces','Inbox':'Inbox','Files':'Files','Knowledge':'Memory','Memory':'Memory','Settings':'Settings','Connections':'Connections','Methods':'Methods','Devices':'Devices','Policy':'Policy','Cost':'Cost','Fleet':'Fleet','Automations':'Automation','Setup':'Setup','Admin setup':'Setup','Activity':'Activity','Chat':'Chat'}
NAVALT={('Spaces','Windows'):'Chat-Windows',('Spaces','Android'):'Spaces-Android'}
cnt={}
def txt(h): return re.sub(r'\s+',' ',re.sub('<[^>]+>','',h)).strip()
for f in sorted(glob.glob(P+'*.dc.html')):
    n=os.path.basename(f)[:-8]
    if n in ('Layouts','Main','Dark-Tokens'): continue
    s=open(f).read(); o=s
    stem,plat=split(n)
    # buttons
    rules=R.get(stem,{})
    def btn(m):
        tag,attrs,inner=m.group(1),m.group(2),m.group(3)
        if 'href=' in attrs or 'dis' in re.findall(r'class="([^"]*)"',attrs)[0].split(): return m.group(0)
        lab=txt(inner)
        if not lab:
            al=re.search(r'aria-label="([^"]*)"',attrs); lab=al.group(1) if al else ''
        t=rules.get(lab)
        if not t: return m.group(0)
        tgt=resolve(t,plat)
        if not tgt or tgt==n: return m.group(0)
        cnt[n]=cnt.get(n,0)+1
        return f'<a href="{tgt}.dc.html"{attrs}>{inner}</a>'
    s=re.sub(r'<(button|div|span)(\s[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*)>((?:(?!</?(?:div|button|span)[ >]).)*?)</\1>',btn,s,flags=re.S)
    # nav
    def nav(m):
        attrs,inner=m.group(1),m.group(2)
        if 'href=' in attrs: return m.group(0)
        lab=txt(inner)
        lab=re.sub(r'\d+$','',lab).strip()
        t=NAV.get(lab)
        if not t: return m.group(0)
        tgt=NAVALT.get((t,plat)) or resolve(t,plat)
        if t!='Home' and tgt and plat and not tgt.endswith(plat) and not NAVALT.get((t,plat)): tgt=None
        if t=='Home': tgt=resolve('Home',plat)
        if not tgt or tgt==n: return m.group(0)
        cnt[n]=cnt.get(n,0)+1
        return f'<a href="{tgt}.dc.html"{attrs}>{inner}</a>'
    s=re.sub(r'<a(\s[^>]*class="(?:tabi|rail|nb|nav|wn|nv)[ "][^>]*)>(.*?)</a>',nav,s,flags=re.S)
    if s!=o: open(f,'w').write(s)
print(sum(cnt.values()),'links in',len(cnt),'boards')
# mark interactive
cj=json.load(open(P+'canvas.json'))
k=0
for b,v in cj['boards'].items():
    fn=P+b
    if os.path.exists(fn) and re.search(r'<a [^>]*href="[A-Za-z0-9-]+\.dc\.html"',open(fn).read()):
        v['is_interactive']=True;k+=1
json.dump(cj,open(P+'canvas.json','w'),indent=1)
print('interactive',k,'of',len(cj['boards']))
