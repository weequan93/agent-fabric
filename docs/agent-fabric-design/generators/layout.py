import json,re,os
from sheets import SETS,PL,TITLE as STITLE
P='../project/'
c=json.load(open(P+'canvas.json')); B=c['boards']
for k in list(c['notes']):
    if k.startswith(('r_sheets_','r_android','r_native')): del c['notes'][k]
A_STEMS=['Inbox','Task','Delivery','Envelope','Recovery','Memory','Files','Notifications','Budget','Share','Export','Takeover','Conversations','Conflict','ModelPicker','MemoryReview','Error','Denied','Invite','NewSpace','Account']
groups=[('Tablet',[f'{s}-Tablet' for s in SETS['Tablet']],834,1112,6,'Task sheets - iPad'),
        ('Desktop',[f'{s}-Desktop' for s in SETS['Desktop']],1440,900,4,'Task sheets - Mac'),
        ('Windows',[f'{s}-Windows' for s in ['Approval','Task','Delivery','Envelope']+SETS['Windows']],1440,900,4,'Task panes and dialogs - Windows'),
        ('Android',[f'{s}-Android' for s in A_STEMS],412,892,6,'More Android screens')]
def title(fn,plat):
    stem=fn.rsplit('-',1)[0]
    sd={'Inbox':'Inbox','Memory':'Memory','Files':'Files','Notifications':'Notifications','Conversations':'Conversations','Budget':'Waiting for budget','Task':'Task result'}
    t=STITLE.get(stem) or sd.get(stem) or stem
    return f"{t} - {PL[plat][0] if plat in PL else 'Android phone'}"
y=40000
for plat,names,w,h,per,note in groups:
    c['notes']['r_grp_'+plat]={'x':0,'y':y-300,'text':note,'kind':'title1','maxW':per*(w+80)}
    for i,n in enumerate(names):
        fn=n+'.dc.html'
        assert os.path.exists(P+fn),fn
        old=B.get(fn,{})
        B[fn]={'x':(i%per)*(w+80),'y':y+(i//per)*(h+120),'w':w,'h':h,'title':old.get('title') or title(fn,plat)}
        if fn not in c['order']: c['order'].append(fn)
    rows=(len(names)+per-1)//per
    y+=rows*(h+120)+520
json.dump(c,open(P+'canvas.json','w'),indent=1)
print('layout ok',y)
