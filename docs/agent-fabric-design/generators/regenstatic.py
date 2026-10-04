import re,sys
sys.path.insert(0,'.')
import dark3,dark4
P='../project/'
pairs=[('Home-Tablet','Home-Dark-Tablet'),('Chat-Tablet','Chat-Dark-Tablet'),('Approval-Tablet','Approval-Dark-Tablet'),('Home-Desktop','Home-Dark-Desktop'),('Chat-Desktop','Chat-Dark-Desktop'),('Approval-Desktop','Approval-Dark-Desktop'),('Chat-Windows','Chat-Dark-Windows'),('Approval-Windows','Approval-Dark-Windows'),('Windows-Desktop','Home-Dark-Windows'),
('Home-Phone','Home-Dark-Phone'),('Chat-Phone','Chat-Dark-Phone'),('Approval-Phone','Approval-Dark-Phone'),('Settings-Phone','Settings-Dark-Phone'),('Android-Phone','Android-Dark-Phone'),('Inbox-Desktop','Inbox-Dark-Desktop'),('Design-Desktop','Design-Dark-Desktop'),('Fleet-Desktop','Fleet-Dark-Desktop')]
pairs+=[(f'{st}-Android',f'{st}-Dark-Android') for st in dark3.ADARK]
pairs+=[(a,b) for a,b,t in dark3.J]+[(a,b) for a,b,t in dark4.J]
mp={a:b for a,b in pairs}
for a,b in pairs:
    s=open(P+a+'.dc.html').read()
    old=open(P+b+'.dc.html').read() if __import__('os').path.exists(P+b+'.dc.html') else ''
    t=re.search(r'<title>(.*?)</title>',old)
    s=s.replace('this.state = { dk: false','this.state = { dk: true',1)
    assert 'dk: true' in s,a
    if t: s=re.sub(r'<title>.*?</title>',f'<title>{t.group(1)}</title>',s,count=1)
    else: s=re.sub(r'<title>(.*?)</title>',lambda m:f'<title>{m.group(1)}, dark</title>',s,count=1)
    s=re.sub(r'href="([A-Za-z0-9-]+)\.dc\.html"',lambda m:f'href="{mp[m.group(1)]}.dc.html"' if m.group(1) in mp and mp[m.group(1)]!=b else m.group(0),s)
    open(P+b+'.dc.html','w').write(s)
print(len(pairs))
