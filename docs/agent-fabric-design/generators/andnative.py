import glob,os
P='../project/'
CSS="""/*m3*/
.tg{width:52px!important;height:32px!important;border-radius:16px!important;background:var(--sf2)!important;border:2px solid var(--ink3)!important;box-sizing:border-box}
.tg::after{top:6px!important;left:6px!important;width:16px!important;height:16px!important;background:var(--ink3)!important;box-shadow:none!important}
.tg.on{background:var(--ac)!important;border-color:var(--ac)!important}
.tg.on::after{top:2px!important;left:22px!important;width:24px!important;height:24px!important;background:var(--onac)!important}
.seg{background:transparent!important;border:1px solid var(--ink3)!important;border-radius:20px!important;padding:0!important;overflow:hidden}
.seg span{border-radius:0!important;box-shadow:none!important}
.seg span+span{border-left:1px solid var(--ln)}
.seg span.on{background:var(--ac2)!important;color:var(--acd)!important;box-shadow:none!important}
.af input,.af select{height:52px!important;border-radius:4px!important;border:1px solid var(--ink3)!important;padding:0 16px!important;font-size:16px!important}
.af textarea{border-radius:4px!important;border:1px solid var(--ink3)!important}
"""
n=0
for f in sorted(glob.glob(P+'*.dc.html')):
    b=os.path.basename(f)
    if not (b.endswith('-Android.dc.html') or 'AndroidTablet' in b or b in ('Android-Phone.dc.html','Android-Tablet.dc.html','Android-Dark-Phone.dc.html','Android-Dark-Tablet.dc.html')): continue
    s=open(f).read()
    if '/*m3*/' in s: continue
    open(f,'w').write(s.replace('</style>',CSS+'</style>',1)); n+=1
print(n)
