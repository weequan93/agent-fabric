import re,glob,os,json
P='../project/'
ex=lambda: {os.path.basename(f)[:-8] for f in glob.glob(P+'*.dc.html')}
E=ex()
WIN=[b for b in E if b.endswith('-Windows')]+['Windows-Desktop']
n=0
def sub(f,fn):
    global n
    s=open(P+f+'.dc.html').read()
    s2=re.sub(r'href="([A-Za-z0-9-]+)\.dc\.html"',lambda m:fn(f,m.group(1),m),s)
    if s2!=s: open(P+f+'.dc.html','w').write(s2)
def win_rep(f,t,m):
    global n
    if t=='Home-Desktop' and f!='Windows-Desktop': new='Windows-Desktop'
    elif t.endswith('-Desktop') and t[:-8]+'-Windows' in E: new=t[:-8]+'-Windows'
    else: return m.group(0)
    if new==f: return m.group(0)
    n+=1; return f'href="{new}.dc.html"'
for f in WIN: sub(f,win_rep)
print('windows retargeted',n)
