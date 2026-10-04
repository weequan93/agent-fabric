import re, os, sys, json, glob
from playwright.sync_api import sync_playwright
P = '/tmp/claude-0/-home-claude/0482ae6d-3df0-5d9d-9810-049984768382/scratchpad/af'
os.makedirs(f'{P}/render/png', exist_ok=True)
only = sys.argv[1:]  # optional substrings
JS = """
() => {
  const root = document.querySelector('.af'); const R = root.getBoundingClientRect(); const out = [];
  const label = e => (e.className && e.className.baseVal === undefined ? e.className : '') + ' | ' + (e.innerText||'').trim().slice(0,40).replace(/\\n/g,' ');
  for (const e of root.querySelectorAll('*')) {
    if (e.closest('svg')) continue;
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const pe = e.parentElement; if (pe && cs.position !== 'absolute' && pe !== root.parentElement) { const pr = pe.getBoundingClientRect(); const pcs = getComputedStyle(pe); if (pcs.display !== 'inline' && r.right > pr.right + 1.5 && pr.width > 0 && getComputedStyle(pe).position !== 'fixed') out.push(['beyond-parent', label(e), Math.round(r.right - pr.right), Math.round(pr.width)]); }
    // text clipped horizontally
    if (e.scrollWidth > e.clientWidth + 1 && e.children.length === 0 && (e.innerText||'').trim()) out.push(['clip-x', label(e), e.scrollWidth, e.clientWidth]);
    // overflowing the board
    if (cs.position !== 'absolute' && (r.right > R.right + 1 || r.bottom > R.bottom + 1)) out.push(['outside', label(e), Math.round(r.right - R.right), Math.round(r.bottom - R.bottom)]);
  }
  // children overflowing their own overflow:hidden parents vertically (content cut off)
  for (const e of root.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    if (cs.overflow === 'hidden' && e !== root && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0) out.push(['cut-y', label(e), e.scrollHeight, e.clientHeight]);
  }
  const dm = root.querySelector('.dmt');
  if (dm) { const D = dm.getBoundingClientRect();
    for (const e of root.querySelectorAll('*')) {
      if (e === dm || dm.contains(e) || e.contains(dm)) continue;
      let r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      if (e.children.length === 0 && (e.innerText||'').trim()) { const rg = document.createRange(); rg.selectNodeContents(e); const tr = rg.getBoundingClientRect(); if (tr.width) r = tr; }
      const leaf = e.children.length === 0 && ((e.innerText||'').trim() || e.tagName === 'INPUT');
      const svg = e.tagName.toLowerCase() === 'svg';
      if (!(leaf || svg)) continue;
      const ox = Math.min(r.right, D.right) - Math.max(r.left, D.left), oy = Math.min(r.bottom, D.bottom) - Math.max(r.top, D.top);
      if (ox > 2 && oy > 2) out.push(['dmt-overlap', label(e), Math.round(ox), Math.round(oy)]);
    }
  }
  if (root.scrollHeight > root.clientHeight + 2) out.push(['root-cut-y', '', root.scrollHeight, root.clientHeight]);
  return out;
}
"""
TPL = '''
([tpl, script, handler]) => {
  class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(o) { this.state = Object.assign({}, this.state, typeof o === 'function' ? o(this.state) : o); } forceUpdate() {} }
  const C = new Function('DCLogic', script + '; return Component;')(DCLogic);
  const inst = new C({});
  const names = Object.keys(inst.renderVals()).filter(k => typeof inst.renderVals()[k] === 'function');
  if (handler === '__list__') return names;
  if (handler) { inst.renderVals()[handler](); }
  const v = inst.renderVals();
  let h = tpl.replace(/<sc-if value="\\{\\{\\s*([\\w.]+)\\s*\\}\\}"[^>]*>([\\s\\S]*?)<\\/sc-if>/g, (m, k, inner) => v[k] ? inner : '');
  h = h.replace(/\\{\\{\\s*([\\w.$]+)\\s*\\}\\}/g, (m, k) => { const x = v[k]; return typeof x === 'function' ? '' : (x == null ? '' : x); });
  return h;
}
'''
res = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for f in sorted(glob.glob(f'{P}/project/*.dc.html')):
        name = os.path.basename(f).replace('.dc.html', '')
        if only and not any(o in name for o in only): continue
        s = open(f).read()
        st = '\n'.join(re.findall(r'<style>(.*?)</style>', s, re.S))
        m = re.search(r'</helmet>\s*(.*?)\s*</x-dc>', s, re.S)
        w, h = [int(x) for x in re.search(r'"width":(\d+),"height":(\d+)', s).groups()]
        body = m.group(1)
        sm = re.search(r'data-dc-script[^>]*>(.*?)</script>', s, re.S)
        variants = [None]
        pg0 = b.new_page()
        if 'onClick=' in body:
            variants = [''] + pg0.evaluate(TPL, [body, sm.group(1), '__list__'])
        issues = []
        for var in variants:
            if var is not None:
                body_v = pg0.evaluate(TPL, [m.group(1), sm.group(1), var])
            else:
                body_v = body
            html = f'<!doctype html><html><head><meta charset="utf-8"><style>{st}</style></head><body>{body_v}</body></html>'
            suffix = '' if var in (None, '') else '__' + var
            if suffix and not re.match(r'__(approve|decline)', suffix) and not os.environ.get('ALLVAR'):
                pass
            open(f'{P}/render/{name}{suffix}.html', 'w').write(html)
            pg = b.new_page(viewport={'width': w, 'height': h})
            pg.goto(f'file://{P}/render/{name}{suffix}.html'); pg.wait_for_timeout(120)
            iss = pg.evaluate(JS)
            if re.search(r'\{\{|<sc-if', pg.content()): iss.append(['unrendered-hole', '', 0, 0])
            for i in iss: i[1] = (var or 'default') + ': ' + i[1]
            issues += iss
            pg.screenshot(path=f'{P}/render/png/{name}{suffix}.png')
            pg.close()
        pg0.close()
        res[name] = issues
    b.close()
bad = {k: v for k, v in res.items() if v}
print(f'{len(res)} boards rendered, {len(bad)} with flags')
for k, v in bad.items():
    print('==', k)
    for i in v[:8]: print('  ', i)
