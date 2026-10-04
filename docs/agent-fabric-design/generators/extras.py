import re,json,sys,os
sys.path.insert(0,'.')
from lib import *
import sheets as S
P='../project/'
rd=lambda n:open(P+n+'.dc.html').read()
# ---------- A. iPad landscape sheets ----------
def make_land(stem):
    css,inner=S.parts(stem+'-Phone')
    inner=S.plat_text(inner,'Tablet')
    h=rd('Inbox-Tablet')
    a=h.find('<div class="af"'); a,b=S.root_span(h,a)
    root=h[a:b]
    ov=(f'<div data-sheet style="position:absolute;inset:0;background:rgba(17,26,34,.40);display:flex;align-items:center;justify-content:center;z-index:5"><a href="Inbox-Tablet.dc.html" aria-label="Close" style="position:absolute;inset:0"></a>'
        f'<div class="shx" role="dialog" aria-label="{S.TITLE[stem]}" style="width:520px;height:auto;max-height:770px;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(17,26,34,.35);font-size:14px;line-height:1.4">{inner}</div></div>')
    root=root[:-6]+ov+'</div>'
    h=h[:a]+root+h[b:]
    cls=sorted({c for sel,_ in re.findall(r'([^{}]+)\{([^{}]*)\}',css) if ':root' not in sel for c in re.findall(r'\.([A-Za-z][\w-]*)',sel) if c!='af'})
    reset=','.join('.shx .'+c for c in cls)+'{all:revert}\n'+','.join('.shx .'+c for c in cls)+'{box-sizing:border-box}\n'
    extra=reset+S.scope(css).replace('.ph','.shx')+'\n.shx a,.shx a[class]{text-decoration:none}.shx *{box-sizing:border-box}.shx>div:first-child{padding-top:18px!important}.shx .ic{width:20px;height:20px}\n'
    h=h.replace('</style>',extra+'</style>',1)
    h=re.sub(r'<title>.*?</title>',f'<title>{S.TITLE[stem]} on iPad landscape</title>',h,count=1)
    ph=rd(stem+'-Phone')
    if 'onClick=' in ph:
        pscript=re.search(r'(<script type="text/x-dc" data-dc-script[^>]*>)(.*?)(</script>)',ph,re.S).group(2)
        h=re.sub(r'(<script type="text/x-dc" data-dc-script[^>]*>)(.*?)(</script>)',lambda m:m.group(1)+pscript+m.group(3),h,count=1,flags=re.S)
    open(P+f'{stem}-TabletLandscape.dc.html','w').write(h)
LAND=S.SETS['Tablet']
for st in LAND: make_land(st)
# ---------- B. dark Android ----------
def dark_of(src,dst,title,extra_map=None):
    s=open(P+src).read()
    m=re.search(r':root\{([^}]*)\}',s)
    cur=dict(x.split(':',1) for x in m.group(1).split(';') if ':' in x); cur.update(dict(x.split(':',1) for x in DARK.split(';')))
    s=s.replace(m.group(0),':root{'+';'.join(f'{k}:{v}' for k,v in cur.items())+'}',1)
    s=re.sub(r'<title>.*?</title>',f'<title>{title}</title>',s,count=1)
    head,rest=s.split('</helmet>',1)
    mp={'#EBEEF3':'#131B23','#DCE3F8':'var(--ac2)','#E9EDF2':'var(--sf2)','#F3F5F8':'var(--bg)','#FFFFFF':'var(--sf)','#E4E9FB':'var(--ac2)','#FBEBC8':'var(--waitbg)','#FADDDB':'var(--badbg)','#46515C':'var(--idle)','#EBD08F':'#5A4716','#F8F9FB':'var(--bg)','#E8ECF2':'var(--sf2)','#DDE2EE':'var(--ln)','rgba(255,255,255,.7)':'rgba(24,33,42,.7)',
        '#F3F4FA':'var(--sf2)','#EEF0F7':'var(--sf)','#D3EBDD':'var(--okbg)','#F6E3B8':'var(--waitbg)','#F4D2D0':'var(--badbg)','#E1E4EC':'var(--idlebg)','#E9EDF6':'#131B23','#D4DCF7':'var(--ac2)','rgba(0,0,0,.06)':'rgba(255,255,255,.08)'}
    for a,b in mp.items(): head=head.replace(a,b); rest=rest.replace(a,b)
    s=head+'</helmet>'+rest
    s=s.replace('</style>','.pri{color:#0B1236 !important}.badge{color:#0B1236 !important}\n</style>',1)
    open(P+dst,'w').write(s)
ADARK=['Approval','Envelope','Delivery','Task','Chat','Inbox','Spaces','Settings']
for st in ADARK:
    dark_of(f'{st}-Android.dc.html',f'{st}-Dark-Android.dc.html',f'{st} on Android phone, dark')
print('A,B ok')
