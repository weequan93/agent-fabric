import re,sys
sys.path.insert(0,'.')
import sheets as S, tabx as T
from lib import LIGHT
P='../project/'
rd=S.rd
AREP=[('Approve with Face ID','Approve with fingerprint'),('Face ID','fingerprint or face unlock'),('iPhone','Android phone')]
def inner_of(stem,suffix):
    css,inner=S.parts(f'{stem}-{suffix}')
    for a,b in AREP: inner=inner.replace(a,b)
    return css,inner
def build(stem,title,list_stem=None,sel=0,rail_on='Inbox',main_w=600,src_suffix='Android'):
    h=rd('Android-Tablet')
    a=h.find('<div class="af"'); a,b=S.root_span(h,a)
    root=h[a:b]
    css,inner=inner_of(stem,src_suffix)
    # rail selection
    root=root.replace('class="nb on"','class="nb"')
    root=re.sub(r'(<a (?:href="[^"]*" )?)class="nb"((?:(?!</a>).)*?'+rail_on+'</a>)',lambda m:m.group(1)+'class="nb on"'+m.group(2),root,count=1,flags=re.S)
    extra=T.reset_css(css)
    if list_stem:
        lcss,linner=inner_of(list_stem,'Android')
        sec=f'<section style="width:380px;flex:none;padding:8px 0 0;display:flex;flex-direction:column;overflow:hidden"><div class="shy" style="flex:1;min-height:0;display:flex;flex-direction:column">{linner}</div></section>'
        i=root.find('<section'); j=root.find('</section>')+len('</section>')
        root=root[:i]+sec+root[j:]
        extra+=T.reset_css(lcss).replace('.shx','.shy')
    else:
        # keep list, move selection
        root=root.replace('class="li on"','class="li"')
        lis=[m.start() for m in re.finditer(r'<div class="li"',root)]
        k=lis[sel]; root=root[:k]+'<div class="li on"'+root[k+len('<div class="li"'):]
    m=re.search(r'<main\b[^>]*>',root); i=m.start(); j=root.rfind('</main>')+len('</main>')
    main=f'<main style="flex:1;min-width:0;margin:16px 16px 16px 0;background:var(--sf);border-radius:28px;overflow:hidden;display:flex;flex-direction:column;align-items:center"><div class="shx" style="width:100%;max-width:{main_w}px;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--sf)">{inner}</div></main>'
    root=root[:i]+main+root[j:]
    # drop the old script (interactions belonged to the inbox input) – replace with phone script if any
    h=h[:a]+root+h[b:]
    h=h.replace('</style>',extra+'.shx>div:first-child{padding-top:24px!important}\n</style>',1)
    mr=re.search(r':root\{([^}]*)\}',h)
    cur=dict(x.split(':',1) for x in mr.group(1).split(';') if ':' in x)
    for x in LIGHT.split(';'):
        k,v=x.split(':',1); cur.setdefault(k,v)
    h=h.replace(mr.group(0),':root{'+';'.join(f'{k}:{v}' for k,v in cur.items())+'}',1)
    h=h.replace('</style>','.shy{position:relative}\n</style>',1)
    h=re.sub(r'<title>.*?</title>',f'<title>{title} on Android tablet</title>',h,count=1)
    # script: use the phone's if interactive else a blank component
    ph=rd(f'{stem}-{src_suffix}')
    m2=re.search(r'(<script type="text/x-dc" data-dc-script[^>]*>)(.*?)(</script>)',ph,re.S)
    body=m2.group(2) if 'onClick=' in ph else 'class Component extends DCLogic {\nrenderVals() {\nreturn {};\n}\n}\n'
    h=re.sub(r'(<script type="text/x-dc" data-dc-script[^>]*>)(.*?)(</script>)',lambda m:m.group(1)+body+m.group(3),h,count=1,flags=re.S)
    fn=f'{stem}-AndroidTablet.dc.html'
    open(P+fn,'w').write(h); return fn
if __name__=='__main__':
    print(build('Approval','Approval',sel=0))
    print(build('Chat','Space chat',list_stem='Spaces',rail_on='Spaces',main_w=640))
