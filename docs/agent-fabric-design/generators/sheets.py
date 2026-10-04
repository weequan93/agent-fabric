import re,json,os
P='../project/'
def rd(n): return open(P+n+'.dc.html').read()
def root_span(s,start):
    # balanced <div ... </div> from index of '<div'
    i=start; d=0
    for m in re.finditer(r'<(/?)div\b',s[start:]):
        d+=-1 if m.group(1) else 1
        if d==0:
            end=s.find('>',start+m.start())+1
            return start,end
def parts(name):
    s=rd(name)
    css=re.search(r'<style>(.*?)</style>',s,re.S).group(1)
    a=s.find('<div class="af"'); a,b=root_span(s,a)
    root=s[a:b]
    open_end=root.find('>')+1
    inner=root[open_end:-len('</div>')]
    inner=re.sub(r'<nav\b.*?</nav>','',inner,flags=re.S)
    return css,inner
def scope(css):
    out=[]
    for sel,body in re.findall(r'([^{}]+)\{([^{}]*)\}',css):
        sel=sel.strip()
        if ':root' in sel or sel.startswith('body') or sel=='a' or sel=='.af': continue
        parts_=[]
        for p in sel.split(','):
            p=p.strip()
            p=p.replace('.af *','.shx *') if p.startswith('.af') else '.shx '+p
            parts_.append(p)
        out.append(','.join(parts_)+'{'+body+'}')
    return '\n'.join(out)
REPL={'Tablet':[('Face ID','Face ID or Touch ID'),('this phone','this iPad'),('your phone','your iPad'),('iPhone','iPad')],
      'Desktop':[('Face ID','Touch ID'),('this phone','this Mac'),('your phone','your Mac'),('iPhone','Mac')],
      'Windows':[('Face ID','Windows Hello'),('this phone','this PC'),('your phone','your PC'),('iPhone','Windows PC')]}
def plat_text(t,plat):
    for a,b in REPL.get(plat,[]): t=t.replace(a,b)
    return t
TITLE={'Envelope':'Task envelope','Startup':'Computer startup and queue','Delivery':'Delivery outcome unknown','Recovery':'Recovery after interruption','Takeover':'Screen takeover','Sensitive':'Sensitive sign-in','Export':'Export and publish','Share':'Share to a Space','Approval':'Approval','Task':'Task result','Stop':'Stop result','Budget':'Waiting for budget','Conflict':'Edit conflict','ModelPicker':'Model choice','MemoryReview':'Suggested memory','Error':'Task failed','Denied':'Permission denied','Invite':'Invite members','NewSpace':'New Space','Account':'Account','SessionExpired':'Signed out'}
PL={'Tablet':('iPad portrait',834,1112,'Chat-Tablet'),'Desktop':('Mac',1440,900,'Chat-Desktop'),'Windows':('Windows',1440,900,'Chat-Windows')}
OVER={'Tablet':'','Desktop':'','Windows':'.shx{border-radius:8px!important}.shx .btn{border-radius:4px!important}.shx .card{border-radius:6px!important}.shx .pill{border-radius:4px!important}'}
def make(stem,plat):
    label,W,H,host=PL[plat]
    css,inner=parts(stem+'-Phone')
    inner=plat_text(inner,plat)
    h=rd(host)
    a=h.find('<div class="af"'); a,b=root_span(h,a)
    root=h[a:b]
    sh_h=min(H-60,840)
    ov=(f'<div data-sheet style="position:absolute;inset:0;background:rgba(17,26,34,.40);display:flex;align-items:center;justify-content:center;z-index:5"><a href="{host}.dc.html" aria-label="Close" style="position:absolute;inset:0"></a>'
        f'<div class="shx" role="dialog" aria-label="{TITLE[stem]}" style="width:520px;height:auto;max-height:{sh_h}px;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(17,26,34,.35);font-size:14px;line-height:1.4">{inner}</div></div>')
    newroot=root[:-len('</div>')]+ov+'</div>'
    h=h[:a]+newroot+h[b:]
    cls=sorted({c for sel,_ in re.findall(r'([^{}]+)\{([^{}]*)\}',css) if ':root' not in sel for c in re.findall(r'\.([A-Za-z][\w-]*)',sel) if c!='af'})
    reset=','.join('.shx .'+c for c in cls)+'{all:revert}\n'+','.join('.shx .'+c for c in cls)+'{box-sizing:border-box}\n'
    extra=reset+scope(css)+'\n.shx a,.shx a[class]{text-decoration:none}.shx *{box-sizing:border-box}.shx>div:first-child{padding-top:18px!important}.shx .ic{width:20px;height:20px}\n'+OVER[plat]
    h=h.replace('</style>',extra+'\n</style>',1)
    h=re.sub(r'<title>.*?</title>',f'<title>{TITLE[stem]} on {label}</title>',h,1)
    fn=f'{stem}-{plat}.dc.html'
    open(P+fn,'w').write(h)
    return fn,f'{TITLE[stem]} - {label}',W,H
SETS={'Tablet':['Approval','Task','Delivery','Envelope','Startup','Recovery','Takeover','Sensitive','Export','Share','Conflict','ModelPicker','MemoryReview','Error','Denied','Invite','NewSpace','Account','SessionExpired'],
      'Desktop':['Approval','Task','Delivery','Envelope','Startup','Recovery','Takeover','Sensitive','Export','Share','Stop','Budget','Conflict','ModelPicker','MemoryReview','Error','Denied','Invite','NewSpace','Account','SessionExpired'],
      'Windows':['Startup','Recovery','Takeover','Sensitive','Export','Share','Stop','Budget','Conflict','ModelPicker','MemoryReview','Error','Denied','Invite','NewSpace','Account','SessionExpired']}
if __name__=='__main__':
    c=json.load(open(P+'canvas.json'))
    y0=40000
    new=[]
    for plat,stems in SETS.items():
        for stem in stems:
            new.append(make(stem,plat))
    # place: rows of 5 per platform
    W_by={'Tablet':(834,1112),'Desktop':(1440,900),'Windows':(1440,900)}
    pos={}
    row=y0
    for plat,stems in SETS.items():
        c['notes']['r_sheets_'+plat]={'x':0,'y':row-300,'text':f'Task sheets - {PL[plat][0]}','kind':'title1','maxW':7800}
        w,h=W_by[plat]; per=4 if plat!='Tablet' else 6
        for i,stem in enumerate(stems):
            fn=f'{stem}-{plat}.dc.html'
            x=(i%per)*(w+80); y=row+(i//per)*(h+120)
            c['boards'][fn]={'x':x,'y':y,'w':w,'h':h,'title':f'{TITLE[stem]} - {PL[plat][0]}'}
            if fn not in c['order']: c['order'].append(fn)
        rows=(len(stems)+per-1)//per
        row+=rows*(h+120)+520
    json.dump(c,open(P+'canvas.json','w'),indent=1)
    print(len(new),'sheet boards')
