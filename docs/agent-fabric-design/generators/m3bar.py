import re,glob,os
P='../project/'
ARROW='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:24px;height:24px"><path d="M20 12H4M10 6l-6 6 6 6"/></svg>'
XI='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:24px;height:24px"><path d="M6 6l12 12M18 6L6 18"/></svg>'
def btn(href,label,icon):
    h=f' href="{href}"' if href else ''
    return f'<a{h} aria-label="{label}" style="width:48px;height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;color:var(--ink);flex:none">{icon}</a>'
CLOSE={'Cancel','Done','Close'}
PAT=re.compile(r'<div (?:class="row" )?style="(?:display:flex;align-items:center;)?height:44px(?:;flex:none)?">(<a(?P<ah>[^>]*)>(?P<al>[^<]*)</a>|<span style="color:var\(--ac\)[^"]*">(?P<sl>[^<]*)</span>)<span class="t3" style="flex:1;text-align:center">(?P<t>[^<]*)</span><span style="width:\d+px"></span></div>')
def rep(m):
    label=m.group('al') if m.group('al') is not None else m.group('sl')
    ah=m.group('ah') or ''
    hm=re.search(r'href="([^"]*)"',ah); href=hm.group(1) if hm else ''
    b=btn(href,label,XI if label in CLOSE else ARROW) if label.strip() else ''
    return f'<div style="display:flex;align-items:center;height:56px;flex:none;gap:4px;margin-left:-12px">{b}<span class="t3" style="flex:1;font-size:20px;font-weight:500;line-height:1.2">{m.group("t")}</span></div>'
PAT2=re.compile(r'<a( href="[^"]*")? class="btn ghost" style="padding:0 8px 0 0;color:var\(--ac\)"><svg[^>]*><path d="M15 6l-6 6 6 6"/></svg>([^<]*)</a>')
n=0
for f in sorted(glob.glob(P+'*-Android.dc.html')):
    s=open(f).read()
    s2,k=PAT.subn(rep,s)
    s2,k2=PAT2.subn(lambda m:btn((m.group(1) or '').replace(' href="','').rstrip('"'),m.group(2),ARROW).replace('width:48px;height:48px','width:48px;height:48px;margin-left:-12px'),s2)
    if k+k2: open(f,'w').write(s2); n+=k+k2; print(os.path.basename(f),k,k2)
print(n)
