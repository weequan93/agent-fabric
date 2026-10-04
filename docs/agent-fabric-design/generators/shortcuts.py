from lib import *
CSS = """
.kb{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:6px;background:var(--sf2);border:1px solid var(--ln);font:600 12px var(--font);color:var(--ink2)}
.kbs{display:flex;gap:4px;flex:none}
.mb{height:32px;flex:none;display:flex;align-items:center;gap:2px;padding:0 12px;background:var(--sf);border-bottom:1px solid var(--ln);font-size:13px;color:var(--ink)}
.mb a{display:flex;align-items:center;height:24px;padding:0 10px;border-radius:6px}
.mb a.on{background:var(--ac);color:var(--onac)}
.mb b{font-weight:700}
.dd{position:absolute;background:var(--sf);border:1px solid var(--ln);border-radius:10px;box-shadow:0 12px 32px rgba(17,26,34,.18);padding:6px}
.mi{display:flex;align-items:center;gap:12px;height:30px;padding:0 10px;border-radius:6px;font-size:13px}
.mi span.nm{flex:1;white-space:nowrap}
.mi.hl{background:var(--ac);color:var(--onac)}
.mi.hl .kb{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.3);color:var(--onac)}
.mi.off{color:var(--ink3)}
.sep{height:1px;background:var(--ln);margin:5px 6px}
.sc{background:var(--sf);border:1px solid var(--ln);border-radius:var(--r);padding:16px 16px 8px;flex:1;min-width:0}
.sr{display:flex;align-items:center;gap:10px;height:34px;border-top:1px solid var(--ln);font-size:13px}
.sr:first-of-type{border-top:0}
.sr span.nm{flex:1;color:var(--ink2)}
"""
def kb(*k): return '<span class="kbs">'+''.join(f'<span class="kb">{x}</span>' for x in k)+'</span>'
def mi(n,*k,cls=''): return f'<div class="mi {cls}"><span class="nm">{n}</span>{kb(*k) if k else ""}</div>'
def card(t,rows):
    r=''.join(f'<div class="sr"><span class="nm">{n}</span>{kb(*k)}</div>' for n,k in rows)
    return f'<div class="sc"><div class="lbl" style="margin-bottom:6px">{t}</div>{r}</div>'
CMD,SH,OPT,CTL='⌘','⇧','⌥','⌃'
menubar = '<div class="mb"><a style="padding:0 12px"><span style="width:12px;height:12px;border-radius:6px;background:var(--ink)"></span></a><a><b>Agent Fabric</b></a><a>File</a><a>Edit</a><a>View</a><a>Space</a><a class="on">Task</a><a>Window</a><a>Help</a><span style="flex:1"></span><a style="gap:8px;background:var(--ac2);color:var(--acd);font-weight:600">'+ic('inbox',16)+'2</a><a style="color:var(--ink2)">Fri 9:41</a></div>'
task_menu = ('<div class="dd" style="left:332px;top:0;width:340px">'
  +mi('New task',CMD,'N')+mi('New task in this Space',SH,CMD,'N')+'<div class="sep"></div>'
  +mi('Send or start',CMD,'↩')+mi('Stop selected task',CMD,'.')+'<div class="sep"></div>'
  +mi('Review pending approval…',OPT,CMD,'A',cls='hl')+mi('Take over the computer',OPT,CMD,'T')+mi('Return control to the agent',OPT,CMD,'R',cls='off')
  +'<div class="sep"></div>'+mi('Open task in new window',SH,CMD,'O')+'</div>')
pop = ('<div class="dd" style="right:56px;top:0;width:340px;padding:14px">'
  '<div class="row" style="margin-bottom:10px"><span style="width:24px;height:24px;border-radius:7px;background:var(--ac);color:var(--onac);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">A</span><span class="t3" style="flex:1">Agent Fabric</span>'+pill('run','3 running')+'</div>'
  '<div class="lbl" style="margin:4px 0 6px">Needs you · 2</div>'
  '<div class="card" style="border-radius:10px">'
  '<div class="row" style="padding:10px 12px"><div style="flex:1;min-width:0"><div class="t3" style="font-size:13px">Make launch preview public</div><div class="sub" style="font-size:12px">Approval · Product</div></div><a class="btn sm" style="height:30px">Review</a></div>'
  '<div class="row" style="padding:10px 12px;border-top:1px solid var(--ln)"><div style="flex:1;min-width:0"><div class="t3" style="font-size:13px">Which interview set?</div><div class="sub" style="font-size:12px">Input · Research</div></div><a class="btn sm" style="height:30px">Clarify</a></div></div>'
  '<div class="sub" style="font-size:12px;margin:10px 0 8px;display:flex;gap:6px">'+ic('lock',14)+'<span>Review opens the app. Approving always asks for Touch ID there.</span></div>'
  '<div class="sep" style="margin:6px 0"></div>'+mi('Open Agent Fabric')+mi('Pause notifications for 1 hour')+'</div>')
stage = ('<div style="position:relative;height:380px;flex:none;background:var(--sf2);border-bottom:1px solid var(--ln)">'
  '<div style="position:absolute;left:40px;top:34px;width:264px"><div class="lbl">Mac</div><h1 class="t1" style="margin:6px 0 10px">Menu bar and keyboard</h1><div class="sub">Every command lives in a menu with its shortcut shown. The menu bar item keeps Needs you in view while the window is closed.</div></div>'
  +task_menu.replace('top:0','top:2px')+pop.replace('top:0','top:2px')+
  '<div class="lbl" style="position:absolute;left:332px;top:350px;white-space:nowrap">Task menu</div><div class="lbl" style="position:absolute;right:56px;top:350px;width:340px;text-align:right">Menu bar item</div></div>')
cards = ('<div class="row" style="align-items:stretch;gap:16px">'
  +card('Navigate',[('Search',(CMD,'K')),('Home',(CMD,'1')),('Inbox',(CMD,'2')),('Spaces',(CMD,'3')),('Files',(CMD,'4')),('Back',(CMD,'[')),('Next Space',(CTL,'Tab'))])
  +card('Compose',[('Send message',(CMD,'↩')),('New line',(SH,'↩')),('Attach',(SH,CMD,'A')),('Ask mode',(OPT,CMD,'1')),('Plan mode',(OPT,CMD,'2')),('Act mode',(OPT,CMD,'3')),('Dictate',(CTL,'Space'))])
  +card('Task',[('New task',(CMD,'N')),('Send or start',(CMD,'↩')),('Stop selected task',(CMD,'.')),('Review approval',(OPT,CMD,'A')),('Take over',(OPT,CMD,'T')),('Return to agent',(OPT,CMD,'R')),('Open in new window',(SH,CMD,'O'))])
  +card('View',[('Toggle sidebar',(CTL,CMD,'S')),('Right pane',(OPT,CMD,'P')),('Zoom in',(CMD,'+')),('Zoom out',(CMD,'−')),('Actual size',(CMD,'0')),('Full screen',(CTL,CMD,'F')),('Close sheet or pane',('Esc',))])
  +'</div>').replace(',', ',') 
note = ('<div class="row" style="gap:16px;align-items:stretch;margin-top:16px">'
  '<div class="card" style="flex:2;padding:14px 16px;background:var(--waitbg);border-color:transparent"><div class="row" style="color:var(--wait);margin-bottom:4px">'+ic('shield',18)+'<span class="t3" style="color:var(--wait)">No shortcut approves anything</span></div><div style="font-size:13px;color:var(--ink)">Review approval opens the review screen. Approving, and any decision that changes what leaves the Space, needs Touch ID on this Mac. The menu bar item and notifications can only open the review.</div></div>'
  '<div class="card" style="flex:1.4;padding:14px 16px"><div class="t3" style="margin-bottom:4px">Full keyboard access</div><div class="sub">Tab reaches every control with a 3 px focus ring. The menu bar item reads "Agent Fabric, 2 need you" to VoiceOver. Windows uses Ctrl in place of Cmd.</div></div>'
  '<div class="card" style="flex:1;padding:14px 16px"><div class="lbl" style="margin-bottom:6px">Related</div><a class="t3" style="display:block;color:var(--ac);font-size:13px;margin-bottom:4px" href="A11y-Desktop.dc.html">Accessibility and keyboard</a><a class="t3" style="display:block;color:var(--ac);font-size:13px" href="Approval-Desktop.dc.html">Approval on Mac</a></div></div>')
body = ('<div style="display:flex;flex-direction:column;width:100%;height:100%">'+menubar+stage+'<div style="padding:22px 40px 0;flex:1;min-width:0">'+cards+note+'</div></div>')
if __name__=='__main__':
    board('Shortcuts-Desktop.dc.html','Mac menu bar and shortcuts',1440,900,body,CSS,direction='column')
    print('ok')
