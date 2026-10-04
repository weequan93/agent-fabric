import re
P='../project/'
def rw(f,fn):
    s=open(P+f+'.dc.html').read(); s2=fn(s)
    if s2!=s: open(P+f+'.dc.html','w').write(s2); print('updated',f)
def atab(s,self_name):
    s=s.replace('href="Chat-Tablet.dc.html"','href="Chat-AndroidTablet.dc.html"').replace('href="Home-Tablet.dc.html"','href="Android-Phone.dc.html"').replace('href="Spaces-Tablet.dc.html"','href="Chat-AndroidTablet.dc.html"')
    # Inbox rail item without link -> link to Android-Tablet (unless current)
    s=re.sub(r'<a class="nb"((?:(?!</a>).)*?Inbox</a>)',r'<a href="Android-Tablet.dc.html" class="nb"\1',s,count=1,flags=re.S)
    return s
def inbox_links(s):
    # make list items clickable
    s=s.replace('</style>','.li{position:relative}\n</style>',1) if '.li{position:relative}' not in s else s
    return s
def host(s):
    s=atab(s,'Android-Tablet')
    s=inbox_links(s)
    # first li (approval) -> Approval-AndroidTablet
    s=s.replace('<div class="li"><div style="display:flex;justify-content:space-between;align-items:center"><span class="pill p-wait"><i></i>Approval','<div class="li"><a href="Approval-AndroidTablet.dc.html" aria-label="Open approval" style="position:absolute;inset:0"></a><div style="display:flex;justify-content:space-between;align-items:center"><span class="pill p-wait"><i></i>Approval',1)
    return s
rw('Android-Tablet',host)
def appr(s):
    s=atab(s,'Approval-AndroidTablet'); s=inbox_links(s)
    s=s.replace('<div class="li"><div style="display:flex;justify-content:space-between;align-items:center"><span class="pill p-wait"><i></i>Input','<div class="li"><a href="Android-Tablet.dc.html" aria-label="Open question" style="position:absolute;inset:0"></a><div style="display:flex;justify-content:space-between;align-items:center"><span class="pill p-wait"><i></i>Input',1)
    return s
rw('Approval-AndroidTablet',appr)
rw('Chat-AndroidTablet',lambda s:atab(s,'Chat-AndroidTablet'))
def hs(s):
    old='<div class="card" style="display:flex;align-items:center;gap:8px;height:44px;padding:0 14px;width:250px;color:var(--ink3)">'
    i=s.find(old)
    if i<0: return s
    j=s.find('</div>',i)
    return s[:i]+old.replace('<div class="card"','<a href="Search-Tablet.dc.html" class="card"')+s[i+len(old):j]+'</a>'+s[j+6:]
rw('Home-Tablet',hs)
