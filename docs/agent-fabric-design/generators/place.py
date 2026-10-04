import re,glob,os,json
P='../project/'
c=json.load(open(P+'canvas.json')); B=c['boards']; N=c['notes']
ex={os.path.basename(f) for f in glob.glob(P+'*.dc.html')}
def size(f):
    s=open(P+f).read(); return tuple(int(x) for x in re.search(r'"width":(\d+),"height":(\d+)',s).groups())
def inter(f):
    s=open(P+f).read(); return 'onClick=' in s or bool(re.search(r'href="[A-Za-z0-9-]+\.dc\.html"',s))
WIN=['Shortcuts-Windows']+[f'{k}-Windows' for k in ['Spaces','Plan','Work','Computer','Design','Cost','Fleet','Automation','Connections','Methods','Search','Activity','Conversations','Runtime','Rollout','Revoke','DeleteSpace','A11y']]
WT={'Shortcuts':'Menu, tray and shortcuts','Spaces':'Spaces','Plan':'Plan review','Work':'Work','Computer':'Computer','Design':'Design Studio','Cost':'Cost','Fleet':'Fleet Console','Automation':'Automation','Connections':'Connections','Methods':'Methods','Search':'Search','Activity':'Activity','Conversations':'Conversations','Runtime':'Runtime qualification','Rollout':'Rollout','Revoke':'Revoke access','DeleteSpace':'Delete a Space','A11y':'Accessibility and keyboard'}
AND=['Automation','Design','Methods','Offline','Empty','Loading','Onboarding','Voice','Attach','Lockscreen']
AT={'Automation':'New automation','Design':'Design Studio','Methods':'Methods','Offline':'Offline','Empty':'Nothing here yet','Loading':'Loading','Onboarding':'First run','Voice':'Voice input','Attach':'Attach','Lockscreen':'Lock screen notification'}
TAB=[('Search','Search'),('Notifications','Notifications'),('Files','Files'),('Conversations','Conversations'),('Empty','Nothing here yet'),('Loading','Loading')]
groups=[
 ('r_win_more','More Windows screens',[(f+'.dc.html',WT[f.rsplit('-',1)[0]]+' - Windows') for f in WIN],4),
 ('r_and_more2','More Android phone screens',[(f'{k}-Android.dc.html',AT[k]+' - Android phone') for k in AND],10),
 ('r_tab_more','More iPad screens',[(f'{k}-Tablet.dc.html',t+' - iPad') for k,t in TAB],6),
 ('r_atab','Android tablet and landscape',[('Approval-AndroidTablet.dc.html','Approval - Android tablet'),('Chat-AndroidTablet.dc.html','Space chat - Android tablet'),('Chat-Landscape-Android.dc.html','Space chat - Android landscape'),('Approval-Landscape-Android.dc.html','Approval - Android landscape')],4),
 ('r_dark3','Dark mode - Android tablet and landscape, foldable, iPad window sizes',[('Android-Dark-Tablet.dc.html','Inbox - Android tablet dark'),('Fold-Dark-Android.dc.html','Foldable - Android dark'),('Home-Dark-SplitView.dc.html','Home - Split View dark'),('Home-Dark-SlideOver.dc.html','Home - Slide Over dark'),('Home-Dark-NarrowWindow.dc.html','Home - narrow window dark'),('Chat-Landscape-Dark-Android.dc.html','Space chat - Android landscape dark'),('Approval-Landscape-Dark-Android.dc.html','Approval - Android landscape dark'),('Approval-Dark-AndroidTablet.dc.html','Approval - Android tablet dark'),('Chat-Dark-AndroidTablet.dc.html','Space chat - Android tablet dark')],0),
 ('r_dark4','Dark mode - more Windows, iPad and Android screens',[('Spaces-Dark-Windows.dc.html','Spaces - Windows dark'),('Work-Dark-Windows.dc.html','Work - Windows dark'),('Computer-Dark-Windows.dc.html','Computer - Windows dark'),('Search-Dark-Windows.dc.html','Search - Windows dark'),('Shortcuts-Dark-Windows.dc.html','Menu, tray and shortcuts - Windows dark'),('Search-Dark-Tablet.dc.html','Search - iPad dark'),('Notifications-Dark-Tablet.dc.html','Notifications - iPad dark'),('Empty-Dark-Tablet.dc.html','Nothing here yet - iPad dark'),('Offline-Dark-Android.dc.html','Offline - Android phone dark'),('Empty-Dark-Android.dc.html','Nothing here yet - Android phone dark'),('Onboarding-Dark-Android.dc.html','First run - Android phone dark'),('Automation-Dark-Android.dc.html','New automation - Android phone dark'),('Design-Dark-Android.dc.html','Design Studio - Android phone dark'),('Methods-Dark-Android.dc.html','Methods - Android phone dark')],0)
]
# remove any previous placement of these
for k,_,items,_ in groups:
    N.pop(k,None)
    for f,_ in items: B.pop(f,None)
y=max(v['y']+v['h'] for v in B.values())+700
for key,title,items,per in groups:
    N[key]={'x':0,'y':y-70,'text':title,'kind':'title1','maxW':5400}
    x=0; rowh=0; row=y
    for i,(f,t) in enumerate(items):
        assert f in ex,f
        w,h=size(f)
        if per and i and i%per==0: x=0; row+=rowh+120; rowh=0
        elif not per and x+w>5400 and x>0: x=0; row+=rowh+120; rowh=0
        B[f]={'x':x,'y':row,'w':w,'h':h,'title':t,'is_interactive':inter(f)}
        if f not in c['order']: c['order'].append(f)
        x+=w+80; rowh=max(rowh,h)
    y=row+rowh+520
json.dump(c,open(P+'canvas.json','w'),indent=1); print(len(B),'boards')
