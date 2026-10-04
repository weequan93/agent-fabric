import re,json,os,sys
sys.path.insert(0,'.')
from lib import CAPTION,FONT_WIN
P='../project/'
rd=lambda n:open(P+n+'.dc.html').read()
TITLE={'Spaces':'Spaces','Plan':'Plan review','Work':'Work','Computer':'Computer','Design':'Design Studio','Cost':'Cost','Fleet':'Fleet Console','Automation':'Automation','Connections':'Connections','Methods':'Methods','Search':'Search','Activity':'Activity','Conversations':'Conversations','Runtime':'Runtime qualification','Rollout':'Rollout','Revoke':'Revoke access','DeleteSpace':'Delete a Space','A11y':'Accessibility and keyboard'}
WEBCSS=""".wb{flex:1;display:flex;min-height:0}
.wb .nv,.wb .nav{height:40px!important;border-radius:4px!important;color:var(--ink)!important;font-size:14px!important;position:relative}
.wb .nv.on,.wb .nav.on{background:rgba(0,0,0,.06)!important;color:var(--ink)!important;box-shadow:none!important;font-weight:600!important}
.wb .nv.on::before,.wb .nav.on::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:2px;background:var(--ac)}
.wb .btn{height:32px;border-radius:4px;font-weight:600;padding:0 14px;font-size:14px}
.wb .btn.sm{height:28px;font-size:13px;padding:0 10px}
.wb .card{border-radius:8px}.wb .chip{border-radius:4px}.wb .pill{border-radius:4px}
.wb .seg,.wb .seg span{border-radius:4px}
.wb.mica>aside:first-child{background:transparent!important;border-right:0!important}
.wb.mica>aside:first-child+*{background:var(--sf);border-top:1px solid var(--ln);border-left:1px solid var(--ln);border-radius:8px 0 0 0}
"""
REP=[('Approve with Touch ID','Approve with Windows Hello'),('Face ID or Touch ID','Windows Hello'),('Touch ID','Windows Hello'),('this Mac','this PC'),('your Mac','your PC'),('⌘K','Ctrl K'),('Cmd','Ctrl')]
def convert(stem):
    s=rd(stem+'-Desktop')
    s=re.sub(r'<div[^>]*aria-hidden="true">(?:\s*<span style="width:12px;height:12px;border-radius:50%;background:#(?:FF5F57|FEBC2E|28C840)"></span>){3}\s*</div>','',s)
    s=re.sub(r'<span aria-hidden="true" style="display:flex;gap:8px">(?:\s*<span style="width:12px;height:12px;border-radius:50%;background:#(?:FF5F57|FEBC2E|28C840)"></span>){3}\s*</span>','',s)
    s=s.replace('margin-left:14px','margin-left:0')
    a0=s.split('</aside>')[0]; mica=('<nav aria-label="Primary"' in a0) or ('class="nv' in a0)
    s=re.sub(r'--font:[^;]*;--r:\d+px;--rb:\d+px',f"--font:{FONT_WIN};--r:8px;--rb:4px",s,1)
    t=TITLE[stem]
    tb=(f'<div style="display:flex;align-items:center;height:32px;flex:none;padding-left:12px;gap:10px;font-size:12px"><span style="width:16px;height:16px;border-radius:4px;background:var(--ac);color:var(--onac);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">A</span><span>{t} - Agent Fabric</span>{CAPTION}</div>\n<div class="wb{" mica" if mica else ""}">')
    s,n=re.subn(r'<div class="af" style="width:1440px;height:900px;display:flex(?:;flex-direction:row)?">','<div class="af" style="width:1440px;height:932px;display:flex;flex-direction:column">\n'+tb,s,1)
    assert n==1,stem
    i=s.rfind('</div>\n</x-dc>')
    s=s[:i]+'</div></div>\n</x-dc>'+s[i+len('</div>\n</x-dc>'):]
    s=s.replace('</style>',WEBCSS+'</style>',1).replace('"$preview":{"width":1440,"height":900}','"$preview":{"width":1440,"height":932}')
    for a,b in REP: s=s.replace(a,b)
    s=re.sub(r'<title>.*?</title>',f'<title>{t} on Windows</title>',s,1)
    open(P+f'{stem}-Windows.dc.html','w').write(s)
    return f'{stem}-Windows.dc.html'
if __name__=='__main__':
    out=[convert(k) for k in TITLE]
    print(len(out),'converted')
