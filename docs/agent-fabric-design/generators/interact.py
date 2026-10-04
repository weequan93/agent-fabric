import re,json,glob,os
P='../project/'
SCRIPT_RE=re.compile(r'(<script type="text/x-dc" data-dc-script[^>]*>)(.*?)(</script>)',re.S)
def divs_span(s):
    """yield (start,end) of every balanced div"""
    st=[];out=[]
    for m in re.finditer(r'<(/?)div\b',s):
        if m.group(1)=='': st.append(m.start())
        else:
            a=st.pop(); out.append((a,s.find('>',m.start())+1))
    return out
# ---- features: each returns (html, state_dict, vals_lines)
def f_toggles(h):
    n=[0]; init=[]
    def rep(m):
        i=n[0]; n[0]+=1; init.append('true' if m.group(1) else 'false')
        return f'<span class="tg {{{{ tg{i}c }}}}" role="switch" aria-checked="{{{{ tg{i}a }}}}"{m.group(2)} onClick="{{{{ tg{i}f }}}}">'
    h=re.sub(r'<span class="tg( on)?" role="switch" aria-checked="(?:true|false)"([^>]*)>',rep,h)
    if not n[0]: return h,{},[]
    vals=[]
    for i in range(n[0]):
        vals+= [f"tg{i}c: s.tg[{i}]?'on':''",f"tg{i}a: s.tg[{i}]?'true':'false'",f"tg{i}f: () => this.setState({{ tg: s.tg.map((v, j) => j === {i} ? !v : v) }})"]
    return h,{'tg':'['+','.join(init)+']'},vals
def f_opts(h):
    n=[0]; on=[0]
    def rep(m):
        if m.group(0).startswith('<div'):
            i=n[0]; n[0]+=1
            if m.group(1): on[0]=i
            return f'<div class="opt {{{{ oc{i} }}}}"{m.group(2)} onClick="{{{{ of{i} }}}}">'
        return '<span class="rd"><span></span></span>'
    h=re.sub(r'<div class="opt( on)?"([^>]*)>|<span class="rd">(?:<span></span>)?</span>',rep,h)
    if not n[0]: return h,{},[]
    vals=[]
    for i in range(n[0]):
        vals+=[f"oc{i}: s.opt === {i} ? 'on' : ''",f"of{i}: () => this.setState({{ opt: {i} }})"]
    return h,{'opt':str(on[0])},vals
HELP="['Ask reads sources. It changes nothing.','Plan drafts steps. Nothing runs until you start it.','Act can change this Space\\'s files. It cannot publish.']"
def f_segs(h):
    segs=[0]; state={}; vals=[]; counter=[0]
    def rep(m):
        k=counter[0]
        cls,attrs,inner=m.group(1),m.group(2),m.group(3)
        kids=list(re.finditer(r'<(button|span)([^>]*)>(.*?)</\1>',inner,re.S))
        if len(kids)<2 or re.search(r'<div|<svg',inner) or sum(len(x.group(0)) for x in kids)!=len(inner.strip()): return m.group(0)
        counter[0]+=1
        on=0; out=[]
        for j,x in enumerate(kids):
            a=x.group(2)
            if re.search(r'class="[^"]*\bon\b',a): on=j
            a=re.sub(r'\sclass="[^"]*"','',a); a=re.sub(r'\saria-(pressed|selected)="[^"]*"','',a)
            out.append(f'<{x.group(1)} class="{{{{ sc{k}_{j} }}}}" onClick="{{{{ sf{k}_{j} }}}}"{a}>{x.group(3)}</{x.group(1)}>')
            vals.extend([f"sc{k}_{j}: s.seg{k} === {j} ? 'on' : ''",f"sf{k}_{j}: () => this.setState({{ seg{k}: {j} }})"])
        state[f'seg{k}']=str(on)
        return f'<div class="{cls}"{attrs}>'+''.join(out)+'</div>'
    h=re.sub(r'<div class="(seg|sgm)"([^>]*)>(.*?)</div>',rep,h,flags=re.S)
    if 'Ask reads sources.<br>It changes nothing.' in h and 'seg0' in state:
        h=h.replace('Ask reads sources.<br>It changes nothing.','{{ help }}',1)
        vals.append(f"help: {HELP}[s.seg0]")
    return h,state,vals
def f_approval(h):
    m=re.search(r'<(a|button)(?: href="([^"]*)")?([^>]*class="[^"]*\bpri\b[^"]*"[^>]*)>((?:(?!</\1>).)*?Approve(?:(?!</\1>).)*?)</\1>',h,re.S)
    d=re.search(r'<(a|button)(?: href="([^"]*)")?([^>]*)>Decline</\1>',h)
    if not m or not d: return h,{},[]
    ah=m.group(2); dh=d.group(2) or 'Inbox-Phone.dc.html'
    h=h.replace(m.group(0),f'<button{m.group(3)} onClick="{{{{ approve }}}}">{m.group(4)}</button>',1)
    h=h.replace(d.group(0),f'<button{d.group(3)} onClick="{{{{ decline }}}}">Decline</button>',1)
    # footer container = smallest div containing both new buttons
    ia=h.find('onClick="{{ approve }}"'); idc=h.find('onClick="{{ decline }}"')
    best=None
    for a,b in divs_span(h):
        if a<ia<b and a<idc<b and (best is None or b-a<best[1]-best[0]): best=(a,b)
    a,b=best
    seg=h[a:b]; ot=seg[:seg.find('>')+1]; inner=seg[len(ot):-6]
    res_ok=(f'<div style="display:flex;flex-direction:column;gap:8px;width:100%"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="pill p-ok"><i></i>Approved</span><span class="sub">Version 4 only. Delivery starts now.</span></div><a href="{ah or "Delivery-Phone.dc.html"}" class="btn pri" style="width:100%">Continue to delivery</a><button class="btn ghost" onClick="{{{{ reset }}}}" style="color:var(--ac);height:32px">Undo (demo)</button></div>')
    res_no=(f'<div style="display:flex;flex-direction:column;gap:8px;width:100%"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="pill p-idle"><i></i>Declined</span><span class="sub">Nothing is published. Draft kept.</span></div><a href="{dh}" class="btn" style="width:100%">Back to Inbox</a><button class="btn ghost" onClick="{{{{ reset }}}}" style="color:var(--ac);height:32px">Undo (demo)</button></div>')
    new=ot+'<sc-if value="{{ undecided }}" hint-placeholder-val="{{ true }}">'+inner+'</sc-if><sc-if value="{{ approved }}" hint-placeholder-val="{{ false }}">'+res_ok+'</sc-if><sc-if value="{{ declined }}" hint-placeholder-val="{{ false }}">'+res_no+'</sc-if></div>'
    h=h[:a]+new+h[b:]
    pill='<span class="pill p-wait"><i></i>Approval</span>'
    if pill in h:
        h=h.replace(pill,'<sc-if value="{{ undecided }}" hint-placeholder-val="{{ true }}">'+pill+'</sc-if><sc-if value="{{ approved }}" hint-placeholder-val="{{ false }}"><span class="pill p-ok"><i></i>Approved</span></sc-if><sc-if value="{{ declined }}" hint-placeholder-val="{{ false }}"><span class="pill p-idle"><i></i>Declined</span></sc-if>',1)
    vals=["undecided: s.decision === ''","approved: s.decision === 'approved'","declined: s.decision === 'declined'","approve: () => this.setState({ decision: 'approved' })","decline: () => this.setState({ decision: 'declined' })","reset: () => this.setState({ decision: '' })"]
    return h,{'decision':"''"},vals
CONFIG={}
def add(names,fns):
    for n in names: CONFIG[n]=fns
plats=['Phone','Tablet','Desktop','Android','Windows']
add([f'Settings-{p}' for p in ['Phone','Android','Tablet']]+['Settings-Dark-Phone','Notifications-Phone','Notifications-Android','Memory-Phone','Memory-Android']+[f'Account-{p}' for p in plats],[f_toggles])
add([f'{n}-{p}' for n in ['Budget','Conflict','Export','NewSpace'] for p in plats if os.path.exists(P+f'{n}-{p}.dc.html')]+['Android-Tablet','Fold-Android'],[f_opts])
add([f'ModelPicker-{p}' for p in plats],[f_opts,f_segs])
add(['Home-Phone','Home-Dark-Phone','Home-Tablet','Home-Desktop','Chat-Phone','Chat-Dark-Phone','Chat-Landscape-Phone','Chat-Tablet','Chat-Desktop','Chat-Android','Chat-Windows','Plan-Phone','Plan-Tablet','Plan-Desktop','Plan-Android','Automation-Tablet'],[f_segs])
add([f'Approval-{p}' for p in plats]+['Approval-Dark-Phone'],[f_approval])
def build(name,fns):
    f=P+name+'.dc.html'
    if not os.path.exists(f): return None
    s=open(f).read()
    if 'onClick=' in s: return 'skip'
    head,sep,rest=s.partition('</helmet>')
    body,sep2,tail=rest.partition('</x-dc>')
    state={};vals=[]
    for fn in fns:
        body,st,vl=fn(body)
        state.update(st); vals+=vl
    if not vals: return 'none'
    code='class Component extends DCLogic {\nconstructor(props) {\nsuper(props);\nthis.state = { '+', '.join(f'{k}: {v}' for k,v in state.items())+' };\n}\nrenderVals() {\nconst s = this.state;\nreturn {\n'+',\n'.join(vals)+'\n};\n}\n}\n'
    tail=SCRIPT_RE.sub(lambda m:m.group(1)+'\n'+code+m.group(3),tail,1)
    s=head+sep+body+sep2+tail
    open(f,'w').write(s)
    return 'ok'
if __name__=='__main__':
    c=json.load(open(P+'canvas.json')); cnt={}
    for n,fns in CONFIG.items():
        r=build(n,fns); cnt[r]=cnt.get(r,0)+1
        if r=='ok': c['boards'][n+'.dc.html']['is_interactive']=True
    json.dump(c,open(P+'canvas.json','w'),indent=1)
    print(cnt)
