import re,sys
sys.path.insert(0,'.')
from lib import DARK
P='../project/'
def dark_of(src,dst,title,extra_map=None):
    s=open(P+src).read()
    m=re.search(r':root\{([^}]*)\}',s)
    cur=dict(x.split(':',1) for x in m.group(1).split(';') if ':' in x); cur.update(dict(x.split(':',1) for x in DARK.split(';')))
    s=s.replace(m.group(0),':root{'+';'.join(f'{k}:{v}' for k,v in cur.items())+'}',1)
    s=re.sub(r'<title>.*?</title>',f'<title>{title}</title>',s,count=1)
    head,rest=s.split('</helmet>',1)
    mp={'#EBEEF3':'#131B23','#DCE3F8':'var(--ac2)','#E9EDF2':'var(--sf2)','#F3F5F8':'var(--bg)','#FFFFFF':'var(--sf)','#E4E9FB':'var(--ac2)','#FBEBC8':'var(--waitbg)','#FADDDB':'var(--badbg)','#46515C':'var(--idle)','#EBD08F':'#5A4716','#F8F9FB':'var(--bg)','#E8ECF2':'var(--sf2)','#DDE2EE':'var(--ln)','rgba(255,255,255,.7)':'rgba(24,33,42,.7)',
        '#F3F4FA':'var(--sf2)','#EEF0F7':'var(--sf)','#D3EBDD':'var(--okbg)','#F6E3B8':'var(--waitbg)','#F4D2D0':'var(--badbg)','#E1E4EC':'var(--idlebg)','#E9EDF6':'#131B23','#D4DCF7':'var(--ac2)','rgba(0,0,0,.06)':'rgba(255,255,255,.08)','#EBD39A':'#5A4716','#E2B5B2':'#5C2A2C','#9DB0F0':'#3A4A8F'}
    for a,b in mp.items(): head=head.replace(a,b); rest=rest.replace(a,b)
    s=head+'</helmet>'+rest
    s=re.sub(r'style="([^"]*)"',lambda m:'style="'+m.group(1).replace('background:#fff','background:var(--sf)').replace('background:#FFF','background:var(--sf)')+'"',s)
    s=s.replace('</style>','.pri{color:#0B1236 !important}.badge{color:#0B1236 !important}\n</style>',1)
    open(P+dst,'w').write(s)

J=[('Android-Tablet','Android-Dark-Tablet','Inbox on Android tablet, dark'),('Fold-Android','Fold-Dark-Android','Android foldable, dark'),
('Home-SplitView','Home-Dark-SplitView','Home in Split View, dark'),('Home-SlideOver','Home-Dark-SlideOver','Home in Slide Over, dark'),('Home-NarrowWindow','Home-Dark-NarrowWindow','Home in a narrow window, dark'),
('Chat-Landscape-Android','Chat-Landscape-Dark-Android','Space chat on Android landscape, dark'),('Approval-Landscape-Android','Approval-Landscape-Dark-Android','Approval on Android landscape, dark'),
('Approval-AndroidTablet','Approval-Dark-AndroidTablet','Approval on Android tablet, dark'),('Chat-AndroidTablet','Chat-Dark-AndroidTablet','Space chat on Android tablet, dark')]
ADARK=['Approval','Envelope','Delivery','Task','Chat','Inbox','Spaces','Settings']
if __name__=='__main__':
    for st in ADARK: dark_of(f'{st}-Android.dc.html',f'{st}-Dark-Android.dc.html',f'{st} on Android phone, dark')
    for a,b,t in J: dark_of(a+'.dc.html',b+'.dc.html',t)
    print('ok')
