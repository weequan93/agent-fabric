import re,json,sys
sys.path.insert(0,'.')
from lib import DARK
P='../project/'
def dark_of(src,dst,title):
    s=open(P+src).read()
    m=re.search(r':root\{([^}]*)\}',s)
    cur=dict(x.split(':',1) for x in m.group(1).split(';') if ':' in x)
    cur.update(dict(x.split(':',1) for x in DARK.split(';')))
    s=s.replace(m.group(0),':root{'+';'.join(f'{k}:{v}' for k,v in cur.items())+'}',1)
    s=re.sub(r'<title>.*?</title>',f'<title>{title}</title>',s,count=1)
    head,rest=s.split('</helmet>',1)
    for a,b in {'#EBEEF3':'#131B23','#DCE3F8':'var(--ac2)','#E9EDF2':'var(--sf2)','#F3F5F8':'var(--bg)','#FFFFFF':'var(--sf)','#E4E9FB':'var(--ac2)','#FBEBC8':'var(--waitbg)','#FADDDB':'var(--badbg)','#46515C':'var(--idle)','#EBD08F':'#5A4716','#F8F9FB':'var(--bg)','#E8ECF2':'var(--sf2)','#DDE2EE':'var(--ln)','rgba(255,255,255,.7)':'rgba(24,33,42,.7)'}.items():
        head=head.replace(a,b); rest=rest.replace(a,b)
    s=head+'</helmet>'+rest
    s=s.replace('</style>','.pri{color:#0B1236 !important}.badge{color:#0B1236 !important}\n</style>',1)
    open(P+dst,'w').write(s)
J=[('Home-Tablet','Home-Dark-Tablet','Home on iPad, dark'),('Chat-Tablet','Chat-Dark-Tablet','Space chat on iPad, dark'),('Approval-Tablet','Approval-Dark-Tablet','Approval on iPad, dark'),
   ('Home-Desktop','Home-Dark-Desktop','Home on Mac, dark'),('Chat-Desktop','Chat-Dark-Desktop','Space chat on Mac, dark'),('Approval-Desktop','Approval-Dark-Desktop','Approval on Mac, dark'),
   ('Chat-Windows','Chat-Dark-Windows','Space chat on Windows, dark'),('Approval-Windows','Approval-Dark-Windows','Approval on Windows, dark'),('Windows-Desktop','Home-Dark-Windows','Home on Windows, dark')]
c=json.load(open(P+'canvas.json')); B=c['boards']
y=max(v['y']+v['h'] for k,v in B.items() if k[:-8] not in [j[1] for j in J])+520
c['notes']['r_dark_more']={'x':0,'y':y-300,'text':'Dark mode - iPad, Mac and Windows','kind':'title1','maxW':5000}
x=0;row=y;rowh=0
for src,dst,t in J:
    dark_of(src+'.dc.html',dst+'.dc.html',t)
    w,h=B[src+'.dc.html']['w'],B[src+'.dc.html']['h']
    if x+w>5400: x=0; row+=rowh+120; rowh=0
    B[dst+'.dc.html']={'x':x,'y':row,'w':w,'h':h,'title':t.replace(' on ',' - ').replace(', dark',' dark'),'is_interactive':True}
    if dst+'.dc.html' not in c['order']: c['order'].append(dst+'.dc.html')
    x+=w+80; rowh=max(rowh,h)
json.dump(c,open(P+'canvas.json','w'),indent=1); print('ok')
