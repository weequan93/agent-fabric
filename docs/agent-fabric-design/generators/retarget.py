import re,glob,os
P='../project/'
ex={os.path.basename(f)[:-8] for f in glob.glob(P+'*.dc.html')}
PLAT={'Tablet','Desktop','Android','Windows'}
AL={'Android':{'Home':'Android-Phone'},'Windows':{'Home':'Windows-Desktop'}}
n=0
for f in glob.glob(P+'*.dc.html'):
    b=os.path.basename(f)[:-8]; p=b.split('-')[-1]
    if p not in PLAT: continue
    s=open(f).read()
    def rep(m):
        global n
        t=m.group(1)
        if not t.endswith('-Phone'): return m.group(0)
        stem=t[:-6]
        new=AL.get(p,{}).get(stem) or (f'{stem}-{p}' if f'{stem}-{p}' in ex else None)
        if new and new!=b and new in ex:
            n+=1; return f'href="{new}.dc.html"'
        return m.group(0)
    s2=re.sub(r'href="([A-Za-z0-9-]+)\.dc\.html"',rep,s)
    if s2!=s: open(f,'w').write(s2)
print('retargeted',n)
