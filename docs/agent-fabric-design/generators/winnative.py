import re,glob,os,sys
sys.path.insert(0,'.')
from m3bar import PAT
P='../project/'
HAM='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
XI='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px"><path d="M6 6l12 12M18 6L6 18"/></svg>'
CSS="""/*winnative*/
.tg{width:40px!important;height:20px!important;border-radius:10px!important;background:transparent!important;border:1px solid var(--ink2)!important;box-sizing:border-box}
.tg::after{top:4px!important;left:4px!important;width:10px!important;height:10px!important;background:var(--ink2)!important;box-shadow:none!important}
.tg.on{background:var(--ac)!important;border-color:var(--ac)!important}
.tg.on::after{left:25px!important;background:var(--onac)!important}
.af input,.af select{height:32px!important;border-radius:4px!important;border:1px solid var(--ln)!important;border-bottom:1px solid var(--ink3)!important;padding:0 10px!important;font-size:14px!important}
.af textarea{border-radius:4px!important;border:1px solid var(--ln)!important;border-bottom:1px solid var(--ink3)!important}
.shx{border:1px solid var(--ln)}
"""
BRAND=re.compile(r'(<aside[^>]*>\s*)<div[^>]*>(?:(?!<a |<nav).)*?Agent Fabric</span></div>',re.S)
def dlg(m):
    label=m.group('al') if m.group('al') is not None else m.group('sl')
    ah=m.group('ah') or ''
    hm=re.search(r'href="([^"]*)"',ah)
    href=f' href="{hm.group(1)}"' if hm else ''
    x=f'<a{href} aria-label="Close" style="width:32px;height:32px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--ink2);flex:none">{XI}</a>' if label.strip() or hm else ''
    return f'<div style="display:flex;align-items:center;height:48px;flex:none;gap:8px"><span class="t2" style="flex:1;font-size:20px;font-weight:600;line-height:1.2">{m.group("t")}</span>{x}</div>'
n=0
files=sorted(glob.glob(P+'*-Windows.dc.html'))+[P+'Windows-Desktop.dc.html']
for f in files:
    if '-Dark-' in f: continue
    s=open(f).read(); o=s
    if '/*winnative*/' not in s: s=s.replace('</style>',CSS+'</style>',1)
    s=PAT.sub(dlg,s)
    s=BRAND.sub(lambda m:m.group(1)+f'<div style="height:40px;display:flex;align-items:center;padding:0 12px;margin-bottom:4px;color:var(--ink)">{HAM}</div>',s,count=1)
    if s!=o: open(f,'w').write(s); n+=1
print(n,'updated')
