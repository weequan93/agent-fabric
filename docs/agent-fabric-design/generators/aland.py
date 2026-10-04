import re,sys
sys.path.insert(0,'.')
from lib import ic,pill
P='../project/'
rd=lambda n:open(P+n+'.dc.html').read()
ap=rd('Android-Phone')
nbcss='\n'.join(l for l in re.search(r'<style>(.*?)</style>',ap,re.S).group(1).split('\n') if l.startswith(('.nb','.badge')))
OVR=nbcss+'\n.btn{border-radius:24px!important}.card{border-radius:16px!important}.pill{border-radius:12px!important}.chip{border-radius:8px!important}\n'
s=rd('Chat-Landscape-Phone')
for x,y in [('width:844px;height:390px','width:892px;height:412px'),('"$preview":{"width":844,"height":390}','"$preview":{"width":892,"height":412}'),('Face ID','fingerprint or face unlock')]: s=s.replace(x,y)
rail=('<nav aria-label="Primary" style="width:112px;flex:none;background:var(--sf2);padding:12px 8px 12px 40px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">'
  +''.join(f'<a href="{h}.dc.html" class="nb{" on" if on else ""}" style="flex:none"><span class="ind">{ic(k,24)}</span>{l}</a>' for k,l,h,on in [('home','Home','Android-Phone',0),('spaces','Spaces','Spaces-Android',1),('inbox','Inbox','Inbox-Android',0)])+'</nav>')
s=re.sub(r'<nav style="width:104px.*?</nav>',lambda m:rail,s,flags=re.S)
s=s.replace('padding:8px 44px 10px 0','padding:8px 40px 10px 8px')
s=s.replace('</style>',OVR+'</style>',1)
s=re.sub(r'<title>.*?</title>',"<title>Space chat on Android phone, landscape</title>",s,count=1)
open(P+'Chat-Landscape-Android.dc.html','w').write(s)
# approval side sheet
kv=lambda a,b:f'<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid var(--ln);font-size:13px"><span style="color:var(--ink3)">{a}</span><span style="font-weight:600;text-align:right">{b}</span></div>'
sheet=('<div data-sheet style="position:absolute;inset:0;background:rgba(0,0,0,.32);z-index:5"><a href="Chat-Landscape-Android.dc.html" aria-label="Close" style="position:absolute;inset:0"></a>'
 '<div role="dialog" aria-label="Approval" style="position:absolute;right:0;top:0;bottom:0;width:400px;background:var(--sf);border-radius:28px 0 0 28px;padding:14px 24px 14px 24px;display:flex;flex-direction:column;gap:6px;box-shadow:-8px 0 32px rgba(0,0,0,.25)">'
 '<div class="row" style="height:28px">'+pill('wait','Approval needed')+'<span style="flex:1"></span><a href="Chat-Landscape-Android.dc.html" aria-label="Close" style="display:flex;color:var(--ink2)">'+ic('x',20)+'</a></div>'
 '<div class="t2" style="font-size:18px">Make launch preview public</div>'
 '<div style="margin-top:2px">'+kv('Action','Publish the preview page')+kv('Who can see it','Anyone with the link')+kv('Valid until','It changes or times out')+'</div>'
 '<div class="row" style="gap:8px;padding:8px 10px;border-radius:12px;background:var(--waitbg);color:var(--ink);font-size:12.5px;line-height:1.3;margin-top:4px">'+ic('warn',18)+'<span>Covers this exact version only. If the page changes you will be asked again.</span></div>'
 '<span style="flex:1"></span>'
 '<a class="btn pri" style="height:44px">Approve with fingerprint</a>'
 '<div class="row" style="gap:8px"><a class="btn" style="flex:1;height:40px">Decline</a><a class="btn ghost" style="flex:1;height:40px;color:var(--ac)">Ask a question</a></div></div></div>')
s2=s.replace('<div style="flex:1;min-width:0;display:flex;flex-direction:column;padding:8px 40px 10px 8px">',sheet+'<div style="flex:1;min-width:0;display:flex;flex-direction:column;padding:8px 40px 10px 8px">',1) if False else None
i=s.rfind('</div>\n</x-dc>')
s2=s[:i]+sheet+'</div>\n</x-dc>'+s[i+len('</div>\n</x-dc>'):]
s2=re.sub(r'<title>.*?</title>',"<title>Approval on Android phone, landscape</title>",s2,count=1)
open(P+'Approval-Landscape-Android.dc.html','w').write(s2)
print('ok')
