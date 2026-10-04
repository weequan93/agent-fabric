import json, os, re
P = '/tmp/claude-0/-home-claude/0482ae6d-3df0-5d9d-9810-049984768382/scratchpad/af/project/'
cv = json.load(open(P + 'canvas.json'))
T = {k.replace('.dc.html', ''): v['title'] for k, v in cv['boards'].items()}

COMFY = """/*comfy*/
.tr{padding:16px 20px;font-size:14px;min-height:56px}
.th{min-height:0;padding-top:14px;padding-bottom:10px}
.kv{padding:12px 0;font-size:14px}
.li{padding:12px 0;font-size:14px}
.opt{padding:16px}
.rel{display:flex;align-items:center;gap:10px;height:56px;padding:0 16px;border:1px solid var(--ln);border-radius:var(--r,12px);background:var(--sf);font-weight:600;font-size:14px;flex:1;min-width:0}
.rel span.s{color:var(--ink3);font-weight:500;font-size:12px}
"""

MAP = {
 'Setup-Desktop': ['Runtime-Desktop', 'Policy-Desktop', 'Cost-Desktop'],
 'Revoke-Desktop': ['Spaces-Desktop', 'Policy-Desktop', 'Activity-Desktop'],
 'Rollout-Desktop': ['Methods-Desktop', 'Memory-Desktop', 'Activity-Desktop'],
 'Runtime-Desktop': ['Setup-Desktop', 'Policy-Desktop', 'Devices-Desktop'],
 'DeleteSpace-Desktop': ['Spaces-Desktop', 'Revoke-Desktop', 'Activity-Desktop'],
 'Connections-Desktop': ['Policy-Desktop', 'Share-Phone', 'Spaces-Desktop'],
 'Policy-Desktop': ['Runtime-Desktop', 'Revoke-Desktop', 'Connections-Desktop'],
 'Cost-Desktop': ['Fleet-Desktop', 'Budget-Phone', 'Setup-Desktop'],
 'A11y-Desktop': ['Dark-Tokens', 'Layouts', 'Settings-Phone'],
 'Plan-Desktop': ['Chat-Desktop', 'Envelope-Phone', 'Startup-Phone'],
 'Devices-Desktop': ['Policy-Desktop', 'Sensitive-Phone', 'Settings-Phone'],
 'Memory-Desktop': ['MemoryReview-Phone', 'Methods-Desktop', 'Revoke-Desktop'],
 'Activity-Desktop': ['Delivery-Phone', 'Inbox-Desktop', 'Stop-Phone'],
 'Spaces-Desktop': ['Conversations-Desktop', 'DeleteSpace-Desktop', 'Connections-Desktop'],
 'Conversations-Desktop': ['Spaces-Desktop', 'Share-Phone', 'Chat-Desktop'],
 'Devices-Windows': ['Policy-Windows', 'Setup-Windows', 'Devices-Desktop'],
 'Policy-Windows': ['Devices-Windows', 'Setup-Windows', 'Policy-Desktop'],
 'Memory-Windows': ['Inbox-Windows', 'Chat-Windows', 'Memory-Desktop'],
 'Setup-Windows': ['Policy-Windows', 'Devices-Windows', 'Setup-Desktop'],
 'Inbox-Windows': ['Chat-Windows', 'Memory-Windows', 'Inbox-Desktop'],
 'Chat-Windows': ['Inbox-Windows', 'Memory-Windows', 'Chat-Desktop'],
 'Methods-Desktop': ['Rollout-Desktop', 'Methods-Phone', 'Memory-Desktop'],
}
CHEV = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;margin-left:auto;color:var(--ink3)"><path d="M9 6l6 6-6 6"/></svg>'
for name, rel in MAP.items():
    fn = P + name + '.dc.html'
    if not os.path.exists(fn): print('missing', name); continue
    s = open(fn).read()
    if '/*comfy*/' not in s:
        s = s.replace('</style>', COMFY + '</style>', 1)
    s = re.sub(r'<!--rel-->.*?<!--/rel-->', '', s, flags=re.S)
    links = ''.join(f'<a href="{r}.dc.html" class="rel"><span>{T.get(r, r)}</span>{CHEV}</a>' for r in rel)
    block = f'<!--rel--><div style="margin-top:auto;padding:16px 0 22px;border-top:1px solid var(--ln);display:flex;flex-direction:column;gap:10px"><span class="lbl">Related screens</span><div style="display:flex;gap:12px">{links}</div></div><!--/rel-->'
    i = s.rindex('</main>')
    s = s[:i] + block + s[i:]
    open(fn, 'w').write(s)
print('polished', len(MAP))
