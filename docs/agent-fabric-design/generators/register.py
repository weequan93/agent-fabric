import re,glob,os,json
P='../project/'
ex={os.path.basename(f)[:-8] for f in glob.glob(P+'*.dc.html')}
land=sorted(f for f in ex if f.endswith('-TabletLandscape'))
dand=sorted(f for f in ex if f.endswith('-Dark-Android'))
# retarget links
def fix(f,cands):
    s=open(P+f+'.dc.html').read()
    def rep(m):
        t=m.group(1)
        if not t.endswith('-Phone') and not t.endswith('-Tablet') and not t.endswith('-Android'): return m.group(0)
        stem=t.rsplit('-',1)[0]
        for c in cands(stem):
            if c in ex and c!=f: return f'href="{c}.dc.html"'
        return m.group(0)
    s2=re.sub(r'href="([A-Za-z0-9-]+)\.dc\.html"',rep,s)
    open(P+f+'.dc.html','w').write(s2)
for f in land: fix(f,lambda st:[f'{st}-TabletLandscape',f'{st}-Tablet',f'{st}-Phone'])
for f in dand: fix(f,lambda st:[f'{st}-Dark-Android',f'{st}-Android'])
TT={'Account':'Account','Approval':'Approval','Conflict':'Conflict','Delivery':'Delivery','Denied':'Access denied','Envelope':'Task envelope','Error':'Problem','Export':'Export','Invite':'Invite','MemoryReview':'Memory review','ModelPicker':'Model picker','NewSpace':'New Space','Recovery':'Back online','SessionExpired':'Session expired','Share':'Share','Startup':'Computer starting','Takeover':'Takeover','Sensitive':'Private step','Task':'Task'}
cj=json.load(open(P+'canvas.json'))
B=cj['boards'];N=cj['notes']
def inter(f):
    s=open(P+f+'.dc.html').read(); return 'onClick=' in s or bool(re.search(r'href="[A-Za-z0-9-]+\.dc\.html"',s))
def add(f,x,y,w,h,t):
    k=f+'.dc.html'
    B[k]={'x':x,'y':y,'w':w,'h':h,'title':t,'is_interactive':inter(f)}
    if k not in cj['order']: cj['order'].append(k)
Y0=67000
N['r_land']={'x':0,'y':Y0,'text':'iPad landscape - task sheets over Inbox','kind':'title1','maxW':5000}
for i,f in enumerate(land):
    st=f[:-len('-TabletLandscape')]
    add(f,(i%4)*1274,Y0+70+(i//4)*914,1194,834,f'{TT.get(st,st)} - iPad landscape')
Y1=Y0+70+5*914+120
N['r_dark_and']={'x':0,'y':Y1,'text':'Dark mode - Android phone native screens','kind':'title1','maxW':5000}
DT={'Approval':'Approval','Envelope':'Task envelope','Delivery':'Delivery','Task':'Task','Chat':'Chat','Inbox':'Inbox','Spaces':'Spaces','Settings':'Settings'}
for i,f in enumerate(dand):
    st=f[:-len('-Dark-Android')]
    add(f,i*492,Y1+70,412,892,f'{DT.get(st,st)} - Android phone dark')
if 'Shortcuts-Desktop' in ex: add('Shortcuts-Desktop',3080,-4800,1440,900,'Menu bar and shortcuts - Mac')
json.dump(cj,open(P+'canvas.json','w'),indent=1)
print(len(B),len(cj['order']))
