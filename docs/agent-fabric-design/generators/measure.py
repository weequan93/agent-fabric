import sys
from playwright.sync_api import sync_playwright
P='/tmp/claude-0/-home-claude/0482ae6d-3df0-5d9d-9810-049984768382/scratchpad/af/render/'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1440,'height':900})
    pg.goto(f'file://{P}{sys.argv[1]}.html'); pg.add_style_tag(content='.af{height:auto!important}')
    print(pg.evaluate("document.querySelector('.af').getBoundingClientRect().height"))
