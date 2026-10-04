import re,json
P='../project/'
rd=lambda n:open(P+n+'.dc.html').read()
def root_span(s,start):
    d=0
    for m in re.finditer(r'<(/?)div\b',s[start:]):
        d+=-1 if m.group(1) else 1
        if d==0: return start,s.find('>',start+m.start())+1
X='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
def ico(p): return f'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="{p}"/></svg>'
SHIELD='M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'
WARN='M12 4l9 16H3zM12 10v4M12 17v.5'
CHEV='M9 6l6 6-6 6'
CHECK='M5 12l5 5 9-10'
# ---------- WINDOWS ----------
WCSS='''
.wp{position:absolute;top:32px;right:0;bottom:0;width:480px;background:var(--sf);border-left:1px solid var(--ln);box-shadow:-8px 0 24px rgba(17,26,34,.14);display:flex;flex-direction:column;z-index:5}
.wp h2{margin:0;font-size:20px;font-weight:600;line-height:1.25}
.wp .hd{display:flex;align-items:flex-start;gap:12px;padding:20px 24px 14px}
.wp .bd{flex:1;min-height:0;padding:4px 24px 16px;display:flex;flex-direction:column;gap:14px;overflow:hidden}
.wp .ft{display:flex;gap:8px;padding:14px 24px 18px;background:var(--sf2);border-top:1px solid var(--ln);align-items:center}
.wp .ib{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--ln);border-left:4px solid var(--wait);background:var(--waitbg);color:var(--ink);border-radius:4px;font-size:13px;line-height:1.4}
.wp .ib .ic{color:var(--wait);width:18px;height:18px}
.wp .ib.info{border-left-color:var(--ac);background:var(--ac2)}.wp .ib.info .ic{color:var(--ac)}
.wp .dl{display:grid;grid-template-columns:120px 1fr;font-size:13px;border-top:1px solid var(--ln)}
.wp .dl>div{padding:9px 0;border-bottom:1px solid var(--ln)}
.wp .dl>div:nth-child(odd){color:var(--ink3)}
.wp .dl>div:nth-child(even){font-weight:600}
.wp .x{width:32px;height:32px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--ink2);margin:-4px -8px 0 auto}
.wp .btn{min-width:96px}
.wp .exp{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--ln);border-radius:4px;background:var(--sf);font-size:13px}
.wp .exp .t{font-weight:600;flex:1}
.wp .exp .ic{width:16px;height:16px;color:var(--ink3)}
.wp .note{font-size:12px;color:var(--ink3);line-height:1.45}
.wp .tile{flex:1;border:1px solid var(--ln);border-radius:4px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--sf)}
'''
def win(stem,title,sub,body,foot):
    h=rd('Chat-Windows')
    a=h.find('<div class="af"'); a,b=root_span(h,a)
    pane=(f'<aside class="wp" role="complementary" aria-label="{title}"><div class="hd"><div><h2>{title}</h2><div class="sub" style="margin-top:2px">{sub}</div></div><a href="Chat-Windows.dc.html" class="x" aria-label="Close">{X}</a></div><div class="bd">{body}</div><div class="ft">{foot}</div></aside>')
    root=h[a:b]; root=root[:-6]+pane+'</div>'
    h=h[:a]+root+h[b:]
    h=h.replace('</style>',WCSS+'</style>',1)
    h=re.sub(r'<title>.*?</title>',f'<title>{title} on Windows</title>',h,1)
    open(P+stem+'-Windows.dc.html','w').write(h)
def dl(rows): return '<div class="dl">'+''.join(f'<div>{k}</div><div>{v}</div>' for k,v in rows)+'</div>'
win('Approval','Approval','Make launch preview public · requested by Priya',
 f'<div class="ib">{ico(SHIELD)}<span><b>This leaves Product.</b> Anyone with the link can open it.</span></div>'+
 dl([('Action','Create a public preview link'),('Artifact','Launch dashboard, v4<br><span class="mono" style="color:var(--ink3);font-weight:400">digest a91c4e07…b2d6</span>'),('Audience','Anyone with the link'),('Lifetime','7 days. You can revoke it.'),('Source check','Disclosure to this audience allowed'),('Checks','3 of 3 passed. Automated evidence, not certification.'),('Cost','No computer needed'),('Expires','Today 18:40, in 3 h 12 min')])+
 '<div class="note">Approves version 4 only. Any edit, new recipient or policy change cancels this approval.</div>',
 '<a href="Delivery-Windows.dc.html" class="btn pri">Approve with Windows Hello</a><a href="Chat-Windows.dc.html" class="btn">Ask for changes</a><a href="Inbox-Windows.dc.html" class="btn">Decline</a>')
win('Task','Task result','Dashboard prototype: launch review',
 '<div style="display:flex;gap:10px"><div class="tile"><span class="lbl">Draft</span><span class="t3">Version 4</span><span class="pill p-ok"><i></i>Draft ready</span></div><div class="tile"><span class="lbl">Checks</span><span class="t3">3 of 3 passed</span><span class="pill p-ok"><i></i>Passed</span></div><div class="tile"><span class="lbl">Delivery</span><span class="t3">Nothing sent</span><span class="pill p-idle"><i></i>Not published</span></div></div>'+
 dl([('Produced','Prototype with 3 screens and 1 token set'),('Files changed','6, all in the task draft'),('External effects','None'),('Remaining','Accept a version, then share or publish'),('Cost','$4.20 settled of $15.00 allowance'),('Attempts','1 run, succeeded')]),
 '<a href="Share-Windows.dc.html" class="btn pri">Share to Space</a><a href="Design-Desktop.dc.html" class="btn">Open in Design Studio</a><a href="Export-Windows.dc.html" class="btn">Publish externally…</a>')
win('Delivery','Delivery outcome unknown','Make launch preview public',
 f'<div class="ib">{ico(WARN)}<span><b>We sent the request but never heard back.</b> The page may or may not be public right now. Draft and checks passing does not mean it was delivered.</span></div>'+
 dl([('Draft','Preview page prepared · Done'),('Checks','Content and link checks · Passed'),('Delivery','Publish to the public address · Outcome unknown')])+
 '<div class="exp"><span class="t">What happens next</span></div><div class="note" style="margin-top:-6px">Check status asks the destination directly. We will not send the request again on our own, so nothing gets published twice.</div>',
 '<a href="Recovery-Windows.dc.html" class="btn pri">Check status</a><a href="Task-Windows.dc.html" class="btn">Open task</a>')
win('Envelope','Task envelope','What "Launch dashboard" may do, set when the task started',
 ''.join(f'<div class="exp">{ico(CHEV)}<span class="t">{t}</span><span class="pill {pc}"><i></i>{pl}</span></div><div style="padding:0 12px;margin:-6px 0 2px;font-size:13px;color:var(--ink2);line-height:1.6">{items}</div>' for t,pc,pl,items in [('Inside the envelope','p-ok','Without asking','Edit the task draft<br>Run approved local tests'),('Needs your approval','p-wait','Asks first','Publish outside Product<br>Send to an external service'),('Not allowed','p-bad','Blocked','Unknown high-impact actions<br>Anything outside Product files')])+
 dl([('Audience','Product, 12 members'),('Cost ceiling','Up to $15.00'),('Must pass','Build, sizes, keyboard')])+
 '<div class="note">Inside the envelope does not mean unchecked. Every action still passes the broker and is judged by what it actually did.</div>',
 '<a href="Chat-Windows.dc.html" class="btn pri">Close</a>')
# ---------- ANDROID ----------
tpl=rd('Android-Phone')
ACSS='''
.sh{position:absolute;left:0;right:0;bottom:0;background:#F3F4FA;border-radius:28px 28px 0 0;padding:0 16px 24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 -4px 24px rgba(17,26,34,.25);z-index:5}
.sh .hdl{width:32px;height:4px;border-radius:2px;background:var(--ink3);opacity:.5;margin:12px auto 0}
.sc{position:absolute;inset:0;background:rgba(17,26,34,.32);z-index:4}
.li3{display:flex;align-items:center;gap:16px;min-height:64px;padding:8px 16px}
.li3 .lead{width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;flex:none}
.li3 .tx{flex:1;min-width:0}
.li3 .tr3{font-size:13px;color:var(--ink3);text-align:right}
.srf{background:#EEF0F7;border-radius:16px;overflow:hidden}
.srf .li3+.li3{border-top:1px solid rgba(0,0,0,.06)}
.bn{display:flex;gap:12px;padding:16px;border-radius:16px;background:var(--waitbg);color:var(--wait);align-items:flex-start;line-height:1.4}
.fab{position:absolute;right:16px;bottom:24px;height:56px;border-radius:16px;padding:0 20px;box-shadow:0 4px 12px rgba(17,26,34,.25);z-index:3}
.tb{display:flex;align-items:center;height:64px;padding:36px 4px 0 4px;box-sizing:content-box;flex:none}
.tb .ib{width:48px;height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;color:var(--ink)}
.tb .ttl{font-size:22px;font-weight:600;flex:1}
.lt{padding:0 20px 8px;font-size:28px;font-weight:600;line-height:1.2}
'''
def andro(stem,title,inner,over_host=None):
    s=tpl
    a=s.find('<div class="af"'); a,b=root_span(s,a)
    if over_host:
        h=rd(over_host); ha,hb=root_span(h,h.find('<div class="af"'))
        root=h[ha:hb]; root=root[:-6]+inner+'</div>'
        s=h[:ha]+root+h[hb:]; s=s.replace('</style>',ACSS+'</style>',1)
        s=re.sub(r'<title>.*?</title>',f'<title>{title} on Android phone</title>',s,1)
    else:
        root=f'<div class="af" style="width:412px;height:892px;display:flex;flex-direction:column">{inner}</div>'
        s=s[:a]+root+s[b:]
        s=s.replace('</style>',ACSS+'</style>',1)
        s=re.sub(r'<title>.*?</title>',f'<title>{title} on Android phone</title>',s,1)
    open(P+stem+'-Android.dc.html','w').write(s)
back=lambda href:f'<a href="{href}" class="ib" aria-label="Back">{ico("M15 6l-6 6 6 6")}</a>'
lead=lambda bg,fg,p:f'<span class="lead" style="background:{bg};color:{fg}">{ico(p)}</span>'

def row3(bg,fg,p,t,sub,tr='',href=None):
    tag='a' if href else 'div'; h=f' href="{href}"' if href else ''
    return f'<{tag}{h} class="li3"><span class="lead" style="background:{bg};color:{fg}">{ico(p)}</span><div class="tx"><div class="t3" style="font-size:16px">{t}</div><div class="sub">{sub}</div></div><div class="tr3">{tr}</div></{tag}>'
OK=('#D3EBDD','var(--ok)'); WT=('#F6E3B8','var(--wait)'); BD=('#F4D2D0','var(--bad)')
# Envelope: bottom sheet over chat
andro('Envelope','Task envelope',
 '<a href="Chat-Android.dc.html" class="sc" aria-label="Close"></a><div class="sh" role="dialog" aria-label="Task envelope"><div class="hdl"></div><div style="padding:4px 8px 0"><div class="t2" style="font-size:22px">Task envelope</div><div class="sub" style="margin-top:2px">What "Launch dashboard" may do, set when the task started.</div></div>'
 '<div class="srf">'+row3(*OK,CHECK,'Without asking','Edit the task draft, run approved local tests')+row3(*WT,'M12 7v5l3 2','Asks first','Publish outside Product, send to an external service')+row3(*BD,'M6 6l12 12M18 6L6 18','Not allowed','Unknown high-impact actions, anything outside Product files')+'</div>'
 '<div class="srf"><div class="li3"><div class="tx"><div class="sub">Audience</div><div class="t3" style="font-size:16px">Product, 12 members</div></div><div class="tx"><div class="sub">Cost ceiling</div><div class="t3" style="font-size:16px">Up to $15.00</div></div></div></div>'
 '<div class="sub" style="padding:0 8px;line-height:1.45">Inside the envelope does not mean unchecked. Every action still passes the broker and is judged by what it actually did.</div>'
 '<a href="Chat-Android.dc.html" class="btn pri" style="width:100%">Got it</a></div>',over_host='Chat-Android')
# Delivery: full screen
andro('Delivery','Delivery outcome unknown',
 f'<div class="tb">{back("Task-Android.dc.html")}<span class="ttl"></span></div><div class="lt">Delivery outcome unknown</div>'
 '<div style="flex:1;overflow:hidden;padding:4px 16px 0;display:flex;flex-direction:column;gap:12px">'
 f'<div class="bn">{ico(WARN)}<span><b>We sent the request but never heard back.</b> The page may or may not be public right now. Draft and checks passing does not mean it was delivered.</span></div>'
 '<div class="srf">'+row3(*OK,CHECK,'Draft','Preview page prepared','Done')+row3(*OK,CHECK,'Checks','Content and link checks','Passed')+row3(*WT,'M12 8v5M12 16v.5','Delivery','Publish to the public address','Unknown')+'</div>'
 '<div class="sub" style="padding:4px 8px;line-height:1.5">Check status asks the destination directly. We will not send the request again on our own, so nothing gets published twice.</div></div>'
 '<div style="padding:12px 16px 28px;display:flex;flex-direction:column;gap:8px;background:var(--bg)"><a href="Recovery-Android.dc.html" class="btn pri" style="width:100%">Check status</a><a href="Task-Android.dc.html" class="btn tonal" style="width:100%">Open task</a></div>')
# Task result: Material large title + FAB
andro('Task','Task result',
 f'<div class="tb">{back("Chat-Android.dc.html")}<span class="ttl"></span><span class="ib">{ico("M12 6v.5M12 12v.5M12 18v.5")}</span></div><div class="lt">Dashboard prototype: launch review</div>'
 '<div style="flex:1;overflow:hidden;padding:4px 16px 0;display:flex;flex-direction:column;gap:12px">'
 '<div style="display:flex;gap:8px"><span class="chip">Act</span><span class="chip">Product</span><span class="chip">Owner: Priya</span></div>'
 '<div class="srf">'+row3(*OK,CHECK,'Draft','Version 4, saved 12 min ago','Ready')+row3(*OK,CHECK,'Checks','3 of 3 required passed','Passed')+row3('#E1E4EC','var(--idle)','M5 12h14','Delivery','Nothing has left Product','Not published')+'</div>'
 '<div class="srf" style="padding:6px 0">'+''.join(f'<div class="li3" style="min-height:48px"><div class="sub" style="width:112px">{k}</div><div class="tx t3" style="font-weight:500">{v}</div></div>' for k,v in [('Produced','Prototype, 3 screens, 1 token set'),('Files changed','6, all in the task draft'),('External effects','None'),('Cost','$4.20 of $15.00')])+'</div>'
 '<div style="display:flex;gap:8px"><a href="Share-Android.dc.html" class="btn tonal" style="flex:1;padding:0 12px">Share</a><a href="Export-Android.dc.html" class="btn" style="flex:1;padding:0 12px">Publish…</a></div></div>'
 f'<a href="Design-Phone.dc.html" class="btn pri fab">{ico("M4 20l4-1 11-11-3-3L5 16zM14 6l3 3")}Open in Design Studio</a>')
print('native ok')
