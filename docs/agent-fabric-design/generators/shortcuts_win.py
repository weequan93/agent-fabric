from lib import *
import shortcuts as M
CSS=M.CSS+"""
.mb{height:32px;background:var(--bg);border-bottom:0;padding:0 12px}
.mb a{border-radius:4px}
.dd{border-radius:8px;box-shadow:0 8px 24px rgba(17,26,34,.22);padding:4px}
.mi{height:32px;border-radius:4px}
.mi .sc2{color:var(--ink3);font-size:13px}
.mi.hl .sc2{color:var(--onac)}
.kb{border-radius:4px}
.btn{height:32px;border-radius:4px;padding:0 14px}
.btn.sm{height:28px}
.card{border-radius:8px}.sc{border-radius:8px}
.pill{border-radius:4px}
u{text-decoration:underline;text-underline-offset:2px}
"""
def mi(n,s='',cls=''): return f'<div class="mi {cls}"><span class="nm">{n}</span><span class="sc2">{s}</span></div>'
kb=M.kb;card=M.card
C,S,A='Ctrl','Shift','Alt'
titlebar='<div class="row" style="height:32px;flex:none;padding-left:12px;gap:10px;font-size:12px;background:var(--bg)"><span style="width:16px;height:16px;border-radius:4px;background:var(--ac);color:var(--onac);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">A</span><span>Launch dashboard - Agent Fabric</span>'+CAPTION+'</div>'
menubar=('<div class="mb"><a><u>F</u>ile</a><a><u>E</u>dit</a><a><u>V</u>iew</a><a><u>S</u>pace</a><a class="on"><u>T</u>ask</a><a><u>W</u>indow</a><a><u>H</u>elp</a></div>')
task=('<div class="dd" style="left:226px;top:0;width:360px">'
 +mi('<u>N</u>ew task','Ctrl+N')+mi('New task in this <u>S</u>pace','Ctrl+Shift+N')+'<div class="sep"></div>'
 +mi('Send or <u>s</u>tart','Ctrl+Enter')+mi('S<u>t</u>op selected task','Ctrl+.')+'<div class="sep"></div>'
 +mi('<u>R</u>eview pending approval…','Ctrl+Alt+A',cls='hl')+mi('Take <u>o</u>ver the computer','Ctrl+Alt+T')+mi('Return control to the agent','Ctrl+Alt+R',cls='off')
 +'<div class="sep"></div>'+mi('Open task in new <u>w</u>indow','Ctrl+Shift+O')+'</div>')
toast=('<div class="dd" style="left:610px;top:0;width:360px;padding:14px;background:var(--sf)">'
 '<div class="row" style="margin-bottom:8px;font-size:12px;color:var(--ink3)"><span style="width:16px;height:16px;border-radius:4px;background:var(--ac);color:var(--onac);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">A</span><span style="flex:1">Agent Fabric</span><span>now</span></div>'
 '<div class="t3">Needs you: an approval</div><div class="sub" style="margin:2px 0 12px">Product has a request waiting. Open Agent Fabric to read what it will do.</div>'
 '<div class="row"><a class="btn pri sm" style="flex:1">Review</a><a class="btn sm" style="flex:1">Remind me in 1 hour</a></div>'
 '<div class="sub" style="font-size:12px;margin-top:10px;display:flex;gap:6px">'+ic('lock',14)+'<span>The toast never shows the action. Approving is only in the app, with Windows Hello.</span></div></div>')
tray=('<div class="dd" style="right:40px;top:0;width:340px;padding:14px">'
 '<div class="row" style="margin-bottom:10px"><span style="width:24px;height:24px;border-radius:4px;background:var(--ac);color:var(--onac);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">A</span><span class="t3" style="flex:1">Agent Fabric</span>'+pill('run','3 running')+'</div>'
 '<div class="lbl" style="margin:4px 0 6px">Needs you · 2</div>'
 '<div class="card">'
 '<div class="row" style="padding:10px 12px"><div style="flex:1;min-width:0"><div class="t3" style="font-size:13px">Make launch preview public</div><div class="sub" style="font-size:12px">Approval · Product</div></div><a class="btn sm">Review</a></div>'
 '<div class="row" style="padding:10px 12px;border-top:1px solid var(--ln)"><div style="flex:1;min-width:0"><div class="t3" style="font-size:13px">Which interview set?</div><div class="sub" style="font-size:12px">Input · Research</div></div><a class="btn sm">Clarify</a></div></div>'
 '<div class="sep" style="margin:10px 0 4px"></div>'+mi('Open Agent Fabric')+mi('Pause notifications for 1 hour')+mi('Quit')+'</div>')
stage=('<div style="position:relative;height:392px;flex:none;background:var(--bg);border-bottom:1px solid var(--ln)">'
 +'<div style="position:absolute;left:12px;right:0;top:0">'+menubar+'</div>'
 +'<div style="position:absolute;left:0;right:0;top:34px;bottom:0">'
 +'<div style="position:absolute;left:24px;top:6px;width:180px"><div class="lbl">Windows</div><div class="t2" style="font-size:20px;margin:4px 0 6px">Menu, tray and keyboard</div><div class="sub" style="font-size:12px">Alt opens the menu bar. Toasts and the tray keep Needs you visible.</div></div>'+task.replace('top:0','top:0')+toast.replace('top:0','top:0')+tray.replace('top:0','top:0')
 +'<div class="lbl" style="position:absolute;left:226px;top:330px">Task menu · Alt+T</div><div class="lbl" style="position:absolute;left:610px;top:330px">Toast and Action Center</div><div class="lbl" style="position:absolute;right:40px;top:330px;width:340px;text-align:right">Taskbar tray flyout</div></div></div>')
cards=('<div class="row" style="align-items:stretch;gap:16px">'
 +card('Navigate',[('Search',(C,'K')),('Home',(C,'1')),('Inbox',(C,'2')),('Spaces',(C,'3')),('Files',(C,'4')),('Back',(A,'←')),('Next Space',(C,'Tab'))])
 +card('Compose',[('Send message',(C,'↵')),('New line',(S,'↵')),('Attach',(C,S,'A')),('Ask mode',(C,A,'1')),('Plan mode',(C,A,'2')),('Act mode',(C,A,'3')),('Dictate',('Win','H'))])
 +card('Task',[('New task',(C,'N')),('Send or start',(C,'↵')),('Stop selected task',(C,'.')),('Review approval',(C,A,'A')),('Take over',(C,A,'T')),('Return to agent',(C,A,'R')),('Open in new window',(C,S,'O'))])
 +card('View',[('Toggle navigation pane',(C,'B')),('Right pane',(C,A,'P')),('Zoom in',(C,'+')),('Zoom out',(C,'−')),('Actual size',(C,'0')),('Full screen',('F11',)),('Close pane or dialog',('Esc',))])
 +'</div>')
note=('<div class="row" style="gap:16px;align-items:stretch;margin-top:16px">'
 '<div class="card" style="flex:2;padding:14px 16px;background:var(--waitbg);border-color:transparent"><div class="row" style="color:var(--wait);margin-bottom:4px">'+ic('shield',18)+'<span class="t3" style="color:var(--wait)">No shortcut approves anything</span></div><div style="font-size:13px;color:var(--ink)">Review approval opens the review screen. Approving, and any decision that changes what leaves the Space, needs Windows Hello on this PC. Toasts and the tray flyout can only open the review.</div></div>'
 '<div class="card" style="flex:1.4;padding:14px 16px"><div class="t3" style="margin-bottom:4px">Full keyboard access</div><div class="sub">F6 moves between the navigation pane, content and right pane. Tab reaches every control with a 3 px focus ring. Narrator reads the tray icon as "Agent Fabric, 2 need you".</div></div>'
 '<div class="card" style="flex:1;padding:14px 16px"><div class="lbl" style="margin-bottom:6px">Related</div><a class="t3" style="display:block;color:var(--ac);font-size:13px;margin-bottom:4px" href="A11y-Windows.dc.html">Accessibility and keyboard</a><a class="t3" style="display:block;color:var(--ac);font-size:13px" href="Approval-Windows.dc.html">Approval on Windows</a></div></div>')
body=('<div style="display:flex;flex-direction:column;width:100%;height:100%">'+titlebar+stage+'<div style="padding:22px 40px 0;flex:1;min-width:0">'+cards+note+'</div></div>')
if __name__=='__main__':
    board('Shortcuts-Windows.dc.html','Windows menu, tray and shortcuts',1440,932,body,CSS,FONT_WIN,r=8,rb=4,direction='column')
    print('ok')
