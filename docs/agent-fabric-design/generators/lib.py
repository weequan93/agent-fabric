import os
OUT = '/tmp/claude-0/-home-claude/0482ae6d-3df0-5d9d-9810-049984768382/scratchpad/af/project'

ICONS = {
 'home': 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
 'spaces': 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
 'inbox': 'M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 13h5l1 3h6l1-3h5',
 'files': 'M4 4h10l6 6v10H4z',
 'link': 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
 'brain': 'M12 3a4 4 0 0 0-4 4 4 4 0 0 0-3 6 4 4 0 0 0 4 6h6a4 4 0 0 0 4-6 4 4 0 0 0-3-6 4 4 0 0 0-4-4z',
 'methods': 'M4 6h16M4 12h10M4 18h6',
 'device': 'M3 5h18v11H3zM8 20h8',
 'shield': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
 'cost': 'M12 3v18M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7',
 'settings': 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3',
 'check': 'M5 12l5 5 9-10',
 'warn': 'M12 4l9 16H3zM12 10v4M12 17v.5',
 'back': 'M15 6l-6 6 6 6',
 'plus': 'M12 5v14M5 12h14',
 'search': 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
 'mic': 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
 'clip': 'M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7',
 'bell': 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
 'lock': 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
 'x': 'M6 6l12 12M18 6L6 18',
 'wifioff': 'M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9.5 17a4 4 0 0 1 5 0M4 4l16 16',
 'chev': 'M9 6l6 6-6 6',
 'cam': 'M4 8h4l2-3h4l2 3h4v11H4zM12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
 'image': 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5a1 1 0 1 0 0 .01',
 'stop': 'M6 6h12v12H6z',
 'user': 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20a8 8 0 0 1 16 0',
 'dl': 'M12 4v11M7 11l5 5 5-5M5 20h14',
 'eye': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
}

def ic(name, size=None, sw=None, extra=''):
    st = ''
    if size or sw or extra:
        st = ' style="'
        if size: st += f'width:{size}px;height:{size}px;'
        if sw: st += f'stroke-width:{sw};'
        st += extra + '"'
    return f'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"{st}><path d="{ICONS[name]}"/></svg>'

def pill(kind, text):
    return f'<span class="pill p-{kind}"><i></i>{text}</span>'

def tick(bg='var(--ok)', size=18):
    return f'<span class="mk" style="background:{bg};color:#fff;width:{size}px;height:{size}px">{ic("check", size-7, 3)}</span>'

LIGHT = '--bg:#F3F5F8;--sf:#FFFFFF;--sf2:#E9EDF2;--ln:#DCE1E8;--ink:#111A22;--ink2:#3F4B57;--ink3:#5B6773;--ac:#2745D0;--ac2:#E4E9FB;--acd:#1B31A3;--wait:#7A4E00;--waitbg:#FBEBC8;--ok:#14633A;--okbg:#D8F0E1;--bad:#9B1F26;--badbg:#FADDDB;--idle:#46515C;--idlebg:#E3E7EC;--onac:#FFFFFF'
DARK = '--bg:#0F151B;--sf:#18212A;--sf2:#222D38;--ln:#2E3A47;--ink:#EAF0F6;--ink2:#C2CCD6;--ink3:#9AA7B4;--ac:#8AA0FF;--ac2:#1E2A5C;--acd:#C3CEFF;--wait:#F2C46B;--waitbg:#3A2C0C;--ok:#7FD8A3;--okbg:#12341F;--bad:#FF9C95;--badbg:#3E1517;--idle:#B4BFCA;--idlebg:#2A3540;--onac:#0B1236'

BASE_CSS = """
body{margin:0}
a{color:inherit;text-decoration:none}
.af{font-family:var(--font);color:var(--ink);background:var(--bg);font-size:14px;line-height:1.4;overflow:hidden;position:relative}
.af *{box-sizing:border-box}
.mono{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px}
.card{background:var(--sf);border:1px solid var(--ln);border-radius:var(--r)}
.lbl{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink3)}
.t1{font-size:28px;font-weight:700;letter-spacing:-.015em;line-height:1.15;margin:0}
.t2{font-size:16px;font-weight:600;line-height:1.3;margin:0}
.t3{font-size:14px;font-weight:600;margin:0}
.sub{color:var(--ink3);font-size:13px}
.pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap}
.pill i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.p-run{color:var(--acd);background:var(--ac2)}
.p-wait{color:var(--wait);background:var(--waitbg)}
.p-wait i{background:none;border:2px solid currentColor;width:8px;height:8px}
.p-ok{color:var(--ok);background:var(--okbg)}
.p-ok i{border-radius:2px}
.p-bad{color:var(--bad);background:var(--badbg)}
.p-bad i{border-radius:0;transform:rotate(45deg);width:7px;height:7px}
.p-idle{color:var(--idle);background:var(--idlebg)}
.p-idle i{border-radius:1px;width:8px;height:2px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 18px;border-radius:var(--rb);border:1px solid var(--ln);background:var(--sf);color:var(--ink);font:600 14px var(--font);cursor:pointer;white-space:nowrap}
.btn.sm{height:36px;padding:0 14px;font-size:13px}
.pri{background:var(--ac);border-color:var(--ac);color:var(--onac)}
.ghost{background:none;border-color:transparent}
.dng{color:var(--bad);border-color:var(--bad)}
.dis{background:var(--sf2);color:var(--ink3)}
.chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;background:var(--sf2);color:var(--ink2);font-size:12px;font-weight:500;white-space:nowrap}
.chip.on{background:var(--ac2);color:var(--acd);font-weight:600}
.ic{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.badge{min-width:20px;height:20px;border-radius:10px;background:var(--ac);color:var(--onac);font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;padding:0 6px}
.tabi{flex:1;height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:var(--ink3);font-size:11px;font-weight:600;position:relative}
.tabi.on{color:var(--ac)}
.nv{display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:8px;color:var(--ink2);font-weight:600;font-size:13px}
.nv.on{background:var(--sf);color:var(--ac);box-shadow:0 0 0 1px var(--ln)}
.rb{width:72px;height:56px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;font-weight:600;color:var(--ink3)}
.rb.on{background:var(--sf);color:var(--ac);box-shadow:0 0 0 1px var(--ln)}
.tr{display:grid;align-items:center;padding:11px 16px;border-top:1px solid var(--ln);font-size:13px;gap:12px}
.th{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink3);border-top:0;padding-top:12px;padding-bottom:8px}
.seg{display:flex;background:var(--sf2);border-radius:10px;padding:3px}
.seg span{flex:1;min-width:64px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:var(--ink3);border-radius:8px}
.seg span.on{background:var(--sf);color:var(--ac);box-shadow:0 1px 2px rgba(0,0,0,.2)}
.tg{width:44px;height:26px;border-radius:13px;background:var(--ln);position:relative;flex:none}
.tg::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:10px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3)}
.tg.on{background:var(--ac)}
.tg.on::after{left:21px;background:var(--onac)}
.ctl{display:flex;align-items:center;gap:12px;padding:11px 14px;border-top:1px solid var(--ln);min-height:60px}
.ctl:first-child{border-top:0}
.val{font-size:13px;font-weight:600;color:var(--ac);white-space:nowrap}
.opt{display:flex;gap:12px;padding:14px;border:1px solid var(--ln);border-radius:var(--r);background:var(--sf);align-items:flex-start}
.opt.on{border-color:var(--ac);background:var(--ac2)}
.rd{width:20px;height:20px;border-radius:10px;border:2px solid var(--ink3);flex:none;margin-top:1px;display:flex;align-items:center;justify-content:center}
.opt.on .rd{border-color:var(--ac)}
.opt.on .rd span{width:10px;height:10px;border-radius:5px;background:var(--ac)}
.kv{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--ln);font-size:13px}
.kv:first-child{border-top:0}
.kv span:first-child{color:var(--ink3)}
.kv span:last-child{font-weight:600;text-align:right}
.li{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--ln);font-size:13px}
.li:first-child{border-top:0}
.mk{border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center}
.n{width:22px;height:22px;border-radius:11px;background:var(--ac2);color:var(--acd);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.sk{background:var(--sf2);border-radius:6px}
.row{display:flex;align-items:center;gap:10px}
.col{display:flex;flex-direction:column}
.ph{border:1px dashed var(--ink3);border-radius:6px;padding:2px 8px;color:var(--ink3);font-size:12px;font-weight:600}
"""

FONT_IOS = "'Hanken Grotesk',system-ui,sans-serif"
FONT_WIN = "'Segoe UI Variable','Segoe UI','Hanken Grotesk',system-ui,sans-serif"
FONT_AND = "'Hanken Grotesk','Roboto',system-ui,sans-serif"

def board(fn, title, w, h, body, extra_css='', font=FONT_IOS, dark=False, r=12, rb=10, direction='row'):
    tokens = DARK if dark else LIGHT
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{{{tokens};--font:{font};--r:{r}px;--rb:{rb}px}}
{BASE_CSS}
{extra_css}
</style>
</helmet>
<div class="af" style="width:{w}px;height:{h}px;display:flex;flex-direction:{direction}">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
"""
    with open(os.path.join(OUT, fn), 'w') as f:
        f.write(html)

# ---------- shared shells ----------
def phone_tabs(on='home', inbox_badge=True):
    items = [('home', 'Home', 'Home-Phone.dc.html'), ('spaces', 'Spaces', 'Spaces-Phone.dc.html'), ('inbox', 'Inbox', 'Inbox-Phone.dc.html')]
    out = '<nav aria-label="Primary" style="display:flex;background:var(--sf);border-top:1px solid var(--ln);padding:6px 8px 30px;flex:none">'
    for k, l, href in items:
        b = '<span class="badge" style="position:absolute;top:0;left:calc(50% + 6px)">3</span>' if (k == 'inbox' and inbox_badge) else ''
        out += f'<a href="{href}" class="tabi{" on" if k == on else ""}">{ic(k)}{l}{b}</a>'
    return out + '</nav>'

def rail(on='spaces'):
    items = [('home', 'Home'), ('spaces', 'Spaces'), ('inbox', 'Inbox'), ('brain', 'Knowledge'), ('settings', 'Settings')]
    out = '<nav class="" aria-label="Primary" style="width:84px;flex:none;background:var(--sf2);border-right:1px solid var(--ln);padding:32px 6px 16px;display:flex;flex-direction:column;align-items:center;gap:6px">'
    for k, l in items:
        out += f'<a class="rb{" on" if k == on else ""}">{ic(k, 22)}{l}</a>'
    return out + '</nav>'

def desk_side(on='spaces', extra=None):
    items = [('home', 'Home'), ('spaces', 'Spaces'), ('inbox', 'Inbox'), ('files', 'Files'), ('link', 'Connections'), ('brain', 'Knowledge'), ('methods', 'Methods'), ('cost', 'Cost')]
    out = '<aside style="width:232px;flex:none;background:var(--sf2);border-right:1px solid var(--ln);padding:24px 12px 16px;display:flex;flex-direction:column;gap:2px">'
    out += '<div class="row" style="padding:0 10px 16px"><span style="width:28px;height:28px;border-radius:8px;background:var(--ac);color:var(--onac);display:flex;align-items:center;justify-content:center;font-weight:700">A</span><span class="t3">Agent Fabric</span></div>'
    for k, l in items:
        out += f'<a class="nv{" on" if k == on else ""}">{ic(k, 18)}{l}</a>'
    out += '<span style="flex:1"></span>'
    for k, l in [('device', 'Devices'), ('shield', 'Policy')]:
        out += f'<a class="nv{" on" if k == on else ""}">{ic(k, 18)}{l}</a>'
    return out + '</aside>'

def android_nav(on='home'):
    items = [('home', 'Home'), ('spaces', 'Spaces'), ('inbox', 'Inbox')]
    out = '<nav aria-label="Primary" style="display:flex;background:var(--sf2);padding:12px 8px 28px;flex:none">'
    for k, l in items:
        o = k == on
        b = '<span class="badge" style="position:absolute;top:-4px;right:12px;background:var(--bad);color:#fff;min-width:16px;height:16px;font-size:11px;padding:0 4px">3</span>' if k == 'inbox' else ''
        out += f'<a style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;font-weight:600;color:{"var(--acd)" if o else "var(--ink2)"}"><span style="width:64px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;position:relative;background:{"var(--ac2)" if o else "none"}">{ic(k, 24)}{b}</span>{l}</a>'
    return out + '</nav>'

CAPTION = '<span style="display:flex;margin-left:auto">' + ''.join(
    f'<span style="width:46px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--ink2)"><svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1">{p}</svg></span>'
    for p in ['<path d="M1 6h10"/>', '<rect x="1.5" y="1.5" width="9" height="9"/>', '<path d="M1 1l10 10M11 1L1 11"/>']) + '</span>'

def win_nav(on='device'):
    items = [('home', 'Home'), ('spaces', 'Spaces'), ('inbox', 'Inbox'), ('files', 'Files'), ('link', 'Connections'), ('brain', 'Knowledge'), ('cost', 'Cost')]
    out = '<aside style="width:260px;flex:none;padding:12px 10px;display:flex;flex-direction:column;gap:2px">'
    for k, l in items:
        out += f'<a class="wn{" on" if k == on else ""}">{ic(k, 18)}{l}</a>'
    out += '<span style="flex:1"></span>'
    for k, l in [('device', 'Devices'), ('shield', 'Policy'), ('settings', 'Settings')]:
        out += f'<a class="wn{" on" if k == on else ""}">{ic(k, 18)}{l}</a>'
    return out + '</aside>'

WIN_CSS = """
.wn{display:flex;align-items:center;gap:12px;height:40px;padding:0 12px;border-radius:4px;color:var(--ink);font-size:14px;position:relative}
.wn.on{background:rgba(0,0,0,.05);font-weight:600}
.wn.on::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:2px;background:var(--ac)}
.btn{height:32px;border-radius:4px;font-weight:600;padding:0 14px;font-size:14px}
.card{border-radius:8px}
.chip{border-radius:4px}
.pill{border-radius:4px}
"""

AND_CSS = """
.btn{height:48px;border-radius:24px;padding:0 24px}
.btn.sm{height:40px}
.card{border-radius:16px}
.chip{border-radius:8px;height:32px}
.opt{border-radius:16px}
"""
