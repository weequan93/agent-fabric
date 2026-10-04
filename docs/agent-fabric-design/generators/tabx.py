import re,json,sys
sys.path.insert(0,'.')
import sheets as S
P='../project/'
rd=S.rd
def reset_css(css):
    cls=sorted({c for sel,_ in re.findall(r'([^{}]+)\{([^{}]*)\}',css) if ':root' not in sel for c in re.findall(r'\.([A-Za-z][\w-]*)',sel) if c!='af'})
    reset=','.join('.shx .'+c for c in cls)+'{all:revert}\n'+','.join('.shx .'+c for c in cls)+'{box-sizing:border-box}\n'
    return reset+S.scope(css).replace('.ph','.shx')+'\n.shx a,.shx a[class]{text-decoration:none}.shx *{box-sizing:border-box}.shx .ic{width:20px;height:20px}\n'
def script_copy(h,stem):
    ph=rd(stem+'-Phone')
    if 'onClick=' in ph:
        ps=re.search(r'(<script type="text/x-dc" data-dc-script[^>]*>)(.*?)(</script>)',ph,re.S).group(2)
        h=re.sub(r'(<script type="text/x-dc" data-dc-script[^>]*>)(.*?)(</script>)',lambda m:m.group(1)+ps+m.group(3),h,count=1,flags=re.S)
    return h
def build(stem,host,title,kind='sheet',w=520,top=None,out=None):
    css,inner=S.parts(stem+'-Phone')
    inner=S.plat_text(inner,'Tablet')
    h=rd(host)
    a=h.find('<div class="af"'); a,b=S.root_span(h,a)
    root=h[a:b]
    m=re.search(r'width:(\d+)px;height:(\d+)px',root); W,H=int(m.group(1)),int(m.group(2))
    if kind=='sheet':
        pos=f'align-items:flex-start;padding-top:{top}px' if top else 'align-items:center'
        ov=(f'<div data-sheet style="position:absolute;inset:0;background:rgba(17,26,34,.40);display:flex;justify-content:center;{pos};z-index:5"><a href="{host}.dc.html" aria-label="Close" style="position:absolute;inset:0"></a>'
            f'<div class="shx" role="dialog" aria-label="{title}" style="position:relative;width:{w}px;height:auto;max-height:{H-120}px;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(17,26,34,.35);font-size:14px;line-height:1.4">{inner}</div></div>')
        root=root[:-6]+ov+'</div>'
        extra=reset_css(css)+'.shx>div:first-child{padding-top:18px!important}\n'
    else:
        # page: replace main with transplanted content
        mm=re.search(r'<main\b[^>]*>',root); i=mm.start()
        j=root.rfind('</main>')+len('</main>')
        main=f'<main style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;overflow:hidden"><div class="shx" style="width:100%;max-width:{w}px;flex:1;min-height:0;display:flex;flex-direction:column;padding-top:8px">{inner}</div></main>'
        root=root[:i]+main+root[j:]
        extra=reset_css(css)
    h=h[:a]+root+h[b:]
    h=h.replace('</style>',extra+'</style>',1)
    h=re.sub(r'<title>.*?</title>',f'<title>{title} on iPad</title>',h,count=1)
    h=script_copy(h,stem)
    fn=f'{stem}-Tablet.dc.html'
    open(P+fn,'w').write(h)
    return fn,W,H
if __name__=='__main__':
    r=[]
    r.append(build('Search','Home-Tablet','Search',w=640,top=110))
    r.append(build('Notifications','Inbox-Tablet','Notifications',w=520))
    r.append(build('Files','Spaces-Tablet','Files',w=520))
    r.append(build('Conversations','Spaces-Tablet','Conversations',w=520))
    r.append(build('Empty','Offline-Tablet','Nothing here yet',kind='page',w=640))
    r.append(build('Loading','Offline-Tablet','Loading',kind='page',w=640))
    print(r)
