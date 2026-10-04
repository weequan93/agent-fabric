import re,json
P='../project/'
rd=lambda n:open(P+n+'.dc.html').read()
ap=rd('Android-Phone')
nav=re.search(r'<nav aria-label="Primary".*?</nav>',ap,re.S).group(0)
nbcss='\n'.join(l for l in re.search(r'<style>(.*?)</style>',ap,re.S).group(1).split('\n') if l.startswith(('.nb','.badge')))
def mknav(on):
    n=nav
    items=['Home','Spaces','Inbox']; tg={'Home':'Android-Phone','Spaces':'Spaces-Android','Inbox':'Inbox-Android'}
    n=n.replace('class="nb on"','class="nb"')
    for it in items:
        n=re.sub(r'<a class="nb"((?:(?!</a>).)*?)'+it+'</a>',lambda m:f'<a href="{tg[it]}.dc.html" class="nb{" on" if it==on else ""}"'+m.group(1)+it+'</a>',n,1,flags=re.S)
    return n
TITLE={'Inbox':'Inbox','Recovery':'Recovery after interruption','Memory':'Memory','Files':'Files','Notifications':'Notifications','Budget':'Waiting for budget','Share':'Share to a Space','Takeover':'Screen takeover','Conversations':'Conversations','Export':'Export and publish','Conflict':'Edit conflict','ModelPicker':'Model choice','MemoryReview':'Suggested memory','Error':'Task failed','Denied':'Permission denied','Invite':'Invite members','NewSpace':'New Space','Account':'Account'}
ON={'Inbox':'Inbox','Conversations':'Spaces'}
OVR=nbcss+'\n.nb .ic{width:24px;height:24px}.btn{border-radius:24px!important}.card{border-radius:16px!important}.pill{border-radius:12px!important}.chip{border-radius:8px!important}\n'
c=json.load(open(P+'canvas.json'))
# place after the last sheet rows: compute max y
maxy=max(v['y']+v['h'] for v in c['boards'].values())
row=maxy+520
c['notes']['r_android_more']={'x':0,'y':row-300,'text':'More Android screens','kind':'title1','maxW':5400}
for i,stem in enumerate(TITLE):
    s=rd(stem+'-Phone')
    for x,y_ in [('Approve with Face ID','Approve with fingerprint'),('Face ID','fingerprint or face unlock')]: s=s.replace(x,y_)
    s=s.replace('width:390px;height:844px','width:412px;height:892px',1)
    s=re.sub(r'<nav aria-label="Primary".*?</nav>',lambda m:mknav(ON.get(stem)),s,flags=re.S)
    s=s.replace('</style>',OVR+'</style>',1)
    s=re.sub(r'<title>.*?</title>',f'<title>{TITLE[stem]} on Android phone</title>',s,1)
    s=s.replace('"$preview":{"width":390,"height":844}','"$preview":{"width":412,"height":892}')
    fn=f'{stem}-Android.dc.html'
    open(P+fn,'w').write(s)
    c['boards'][fn]={'x':(i%6)*500,'y':row+(i//6)*1000,'w':412,'h':892,'title':f'{TITLE[stem]} - Android phone'}
    if fn not in c['order']: c['order'].append(fn)
json.dump(c,open(P+'canvas.json','w'),indent=1)
print('ok')
