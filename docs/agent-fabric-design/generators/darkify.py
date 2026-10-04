import re,glob,os,sys
sys.path.insert(0,'.')
from lib import DARK
P='../project/'
# (token, light literal, dark value)
T=[('k1','#EBEEF3','#131B23'),('k2','#DCE3F8','#1E2A5C'),('k3','#E9EDF2','#222D38'),('k4','#F3F5F8','#0F151B'),('k5','#FFFFFF','#18212A'),('k6','#E4E9FB','#1E2A5C'),
('k7','#FBEBC8','#3A2C0C'),('k8','#FADDDB','#3E1517'),('k9','#46515C','#B4BFCA'),('k10','#EBD08F','#5A4716'),('k11','#F8F9FB','#0F151B'),('k12','#E8ECF2','#222D38'),
('k13','#DDE2EE','#2E3A47'),('k14','rgba(255,255,255,.7)','rgba(24,33,42,.7)'),('k15','#F3F4FA','#222D38'),('k16','#EEF0F7','#18212A'),('k17','#D3EBDD','#12341F'),
('k18','#F6E3B8','#3A2C0C'),('k19','#F4D2D0','#3E1517'),('k20','#E1E4EC','#2A3540'),('k21','#E9EDF6','#131B23'),('k22','#D4DCF7','#1E2A5C'),('k23','rgba(0,0,0,.06)','rgba(255,255,255,.08)'),
('k24','rgba(0,0,0,.05)','rgba(255,255,255,.06)'),('k25','#EBD39A','#5A4716'),('k26','#E2B5B2','#5C2A2C'),('k27','#9DB0F0','#3A4A8F'),('k28','#B9C5F2','#3A4A8F'),('k29','#E4E8EE','#131B23'),
('k30','#C5CCD6','#2E3A47'),('k31','#C5CFF5','#2E3A5C'),('k32','#E3B0AE','#7A3A3E'),('k33','#B4BCC7','#6B7885'),('k34','#2745D0','#8AA0FF')]
SKIP=('Start-Here','Handoff-Notes','Main','Layouts','Dark-Tokens')
def lit(l): return re.compile(r'(?<![0-9A-Fa-f])'+re.escape(l)+r'(?![0-9A-Fa-f])',re.I) if l.startswith('#') else re.compile(re.escape(l))
PATS=[(t,lit(l),l,d) for t,l,d in T]
def css_fix(txt,used):
    for t,p,l,d in PATS:
        if p.search(txt): txt=p.sub(f'var(--{t})',txt); used.add(t)
    return txt
def rule_fix(txt):
    # accent bg + white text -> onac ; white bg -> sf (not .tg)
    def decl(body):
        if re.search(r'background:var\(--ac\)(?![\w-])',body): body=re.sub(r'(?<![\w-])color:#(?:fff|FFF|ffffff|FFFFFF)\b','color:var(--onac)',body)
        return body
    return decl(txt)
def style_block(css,used):
    out=[]
    for line in css.split('\n'):
        if line.lstrip().startswith('.tg'): out.append(line); continue
        # per-rule
        def rep(m): return m.group(1)+'{'+rule_fix(css_fix(m.group(2),used)).replace('background:#fff','background:var(--sf)').replace('background:#FFF','background:var(--sf)')+'}'
        out.append(re.sub(r'([^{}]+)\{([^{}]*)\}',rep,line))
    return '\n'.join(out)
def attr_fix(v,used):
    v=css_fix(v,used); v=rule_fix(v)
    return v.replace('background:#fff','background:var(--sf)').replace('background:#FFF','background:var(--sf)')
DMT=""".dmt{position:absolute;top:6px;right:10px;z-index:999;height:22px;padding:0 9px;border-radius:11px;background:rgba(128,128,128,.22);color:var(--ink2);font:600 11px var(--font);display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;line-height:1}
.dmt.c{left:50%;right:auto;transform:translateX(-50%)}
.dmt svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
"""
def process(f,center=False):
    s=open(f).read()
    if 'class="dmt' in s: return 'skip'
    used=set()
    s=re.sub(r'(<style>)(.*?)(</style>)',lambda m:m.group(1)+style_block(m.group(2),used)+m.group(3),s,flags=re.S)
    s=re.sub(r'style="([^"]*)"',lambda m:'style="'+attr_fix(m.group(1),used)+'"',s)
    # tokens in :root
    mr=re.search(r':root\{([^}]*)\}',s)
    add=''.join(f';--{t}:{l}' for t,_,l,_ in [(t,p,l,d) for t,p,l,d in PATS] if t in used)
    s=s.replace(mr.group(0),':root{'+mr.group(1)+add+'}',1)
    dk=DARK+''.join(f';--{t}:{d}' for t,_,l,d in PATS if t in used)
    css=f".af.dk{{{dk}}}\n.af.dk .pri,.af.dk .badge{{color:var(--onac)!important}}\n"+DMT
    s=s.replace('</style>',css+'</style>',1)
    # root class + toggle
    m=re.search(r'<div class="af( [^"]*)?"([^>]*)>',s)
    assert m,f
    new=f'<div class="af{{{{ dk }}}}{m.group(1) or ""}"{m.group(2)}>\n<a class="dmt{" c" if center else ""}" role="button" aria-label="Switch between light and dark" onClick="{{{{ tt }}}}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14a8 8 0 1 1-10-10 6 6 0 0 0 10 10z"/></svg>{{{{ dl }}}}</a>'
    s=s.replace(m.group(0),new,1)
    # script
    sm=re.search(r'(<script type="text/x-dc" data-dc-script[^>]*>)(.*?)(</script>)',s,re.S)
    sc=sm.group(2)
    if 'constructor(' not in sc:
        sc=sc.replace('class Component extends DCLogic {','class Component extends DCLogic {\nconstructor(props) {\nsuper(props);\nthis.state = { dk: false };\n}',1)
    else:
        sc=re.sub(r'this\.state = \{','this.state = { dk: false,',sc,count=1)
    assert 'renderVals()' in sc,f
    i=sc.find('return {',sc.find('renderVals()'))
    assert i>=0,f
    sc=sc[:i]+"return {\ndk: this.state.dk ? ' dk' : '',\ndl: this.state.dk ? 'Light' : 'Dark',\ntt: () => this.setState({ dk: !this.state.dk }),"+sc[i+len('return {'):]
    s=s[:sm.start(2)]+sc+s[sm.end(2):]
    s=s.replace('</x-dc>','</x-dc>',1)
    open(f,'w').write(s)
    return 'ok'
if __name__=='__main__':
    names=sys.argv[1:]
    n=0
    for f in sorted(glob.glob(P+'*.dc.html')):
        b=os.path.basename(f)[:-8]
        if b in SKIP or '-Dark-' in b or (names and b not in names): continue
        r=process(f,center=b.endswith('-Windows') or b=='Windows-Desktop')
        n+=1
    print(n,'processed')
