import re,json,glob,os
P='../project/'
rd=lambda n:open(P+n+'.dc.html').read()
ap=rd('Android-Phone')
nav=re.search(r'<nav aria-label="Primary".*?</nav>',ap,re.S).group(0)
nbcss='\n'.join(l for l in re.search(r'<style>(.*?)</style>',ap,re.S).group(1).split('\n') if l.startswith(('.nb','.badge')))
def mknav(on):
    n=nav; tg={'Home':'Android-Phone','Spaces':'Spaces-Android','Inbox':'Inbox-Android'}
    n=n.replace('class="nb on"','class="nb"')
    for it in tg:
        n=re.sub(r'<a class="nb"((?:(?!</a>).)*?)'+it+'</a>',lambda m:f'<a href="{tg[it]}.dc.html" class="nb{" on" if it==on else ""}"'+m.group(1)+it+'</a>',n,1,flags=re.S)
    return n
TITLE={'Automation':'New automation','Design':'Design Studio','Methods':'Methods','Offline':'Offline','Empty':'Nothing here yet','Loading':'Loading','Onboarding':'First run','Voice':'Voice input','Attach':'Attach','Lockscreen':'Lock screen notification'}
ON={'Offline':'Home','Empty':'Spaces'}
OVR=nbcss+'\n.nb .ic{width:24px;height:24px}.btn{border-radius:24px!important}.card{border-radius:16px!important}.pill{border-radius:12px!important}.chip{border-radius:8px!important}\n'
out=[]
for stem,t in TITLE.items():
    s=rd(stem+'-Phone')
    for x,y_ in [('Approve with Face ID','Approve with fingerprint'),('Face ID','fingerprint or face unlock'),('iPhone','Android phone')]: s=s.replace(x,y_)
    s=s.replace('width:390px;height:844px','width:412px;height:892px',1)
    s=re.sub(r'<nav aria-label="Primary".*?</nav>',lambda m:mknav(ON.get(stem)),s,flags=re.S)
    s=s.replace('</style>',OVR+'</style>',1)
    s=re.sub(r'<title>.*?</title>',f'<title>{t} on Android phone</title>',s,count=1)
    s=s.replace('"$preview":{"width":390,"height":844}','"$preview":{"width":412,"height":892}')
    if stem=='Lockscreen':
        s=s.replace('<span style="font-size:13px;font-weight:600">Locked</span></div>','<span style="font-size:13px;font-weight:600">Locked</span></div><div style="text-align:center;font-size:76px;font-weight:300;line-height:1;margin-top:28px;letter-spacing:-.02em">9:41</div><div style="text-align:center;opacity:.85;font-size:15px;margin-top:6px">Fri, 2 Oct</div>',1)
    fn=f'{stem}-Android.dc.html'
    open(P+fn,'w').write(s); out.append(fn)
print(len(out))
