"""Build Thinking Line.

Reads template.html, injects papers.json (research notes) and the portrait
photo (base64), and writes:
  artifact.html  - body-only page (what gets published to claude.ai artifacts)
  index.html     - complete standalone page (open locally / deploy to GitHub Pages)
Run:  python build.py
"""
import base64, json, pathlib, shutil, math

root = pathlib.Path(__file__).parent
tpl = (root / "template.html").read_text(encoding="utf-8")
trips = json.loads((root/'trips.json').read_text(encoding='utf-8'))
for trip in trips:
    if not trip.get('id') or not trip.get('title') or len(trip.get('points', [])) < 2:
        raise ValueError('Every route needs an ID, title and at least two stops')
    coordinates = trip.get('geometry', {}).get('coordinates', [])
    if trip.get('geometry', {}).get('type') != 'LineString' or len(coordinates) < 2:
        raise ValueError(f"{trip['id']}: route geometry is required")
    if any(len(p) != 2 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in p) or abs(p[0]) > 180 or abs(p[1]) > 85 for p in coordinates):
        raise ValueError(f"{trip['id']}: invalid route coordinates")
    if trip.get('loop', True) and coordinates[0] != coordinates[-1]:
        raise ValueError(f"{trip['id']}: this trip must close into a loop")
(root/'assets/map/trips.json').write_text(json.dumps(trips,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

papers_path = root / "papers.json"
papers = json.loads(papers_path.read_text(encoding="utf-8")) if papers_path.exists() else []
for p in papers:
    p.setdefault("track", "research")
    p.setdefault("kind", "paper")
    p.setdefault("comments", [])
    p.setdefault("tags", [])
    p.setdefault("views", 0)
    p.setdefault("hooks", 0)
    p.setdefault("read", 3)
    note = p.get('note')
    if not isinstance(note, dict):
        raise ValueError(f"{p['id']}: research notes need structured content")
    for field in ('problem', 'contributions', 'method', 'evaluation'):
        if not isinstance(note.get(field), list) or not note[field] or not all(isinstance(text, str) and text.strip() for text in note[field]):
            raise ValueError(f"{p['id']}: {field} must contain text paragraphs")
    note.setdefault('myTake', '')
    if not isinstance(note['myTake'], str):
        raise ValueError(f"{p['id']}: myTake must be text")
    if p.get('topic') not in ('gui-agent', 'agent-security', 'models-methods'):
        raise ValueError(f"{p['id']}: select a research topic")
    if not p.get('figure') and not p.get('methodDiagram'):
        raise ValueError(f"{p['id']}: the method needs a figure or explanatory diagram")

portrait = base64.b64encode((root / "assets" / "portrait.jpg").read_bytes()).decode()

posts = json.loads((root / 'posts.json').read_text(encoding='utf-8'))
public_papers = [{k:v for k,v in p.items() if k not in ('sourceDeck', 'sourceSlides')} for p in papers]
def script_json(value):
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
page = (tpl.replace("__PAPERS_JSON__", script_json(public_papers))
           .replace("__PORTRAIT_B64__", portrait)
           .replace("__POSTS_JSON__", script_json(posts))
           .replace("__SHARED_JS__", (root/'shared.js').read_text(encoding='utf-8'))
           .replace("__LIFE_CSS__", (root/'life.css').read_text(encoding='utf-8'))
           .replace("__LIFE_MAP_JS__", (root/'life-map.js').read_text(encoding='utf-8'))
           .replace("__LIFE_JS__", (root/'life.js').read_text(encoding='utf-8').replace('__FISHING_JSON__', script_json(json.loads((root/'fishing.json').read_text(encoding='utf-8'))))))
(root / "artifact.html").write_text(page, encoding="utf-8")

head, body = page.split("<!-- /head -->", 1)
index = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
         "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
         "<meta name=\"color-scheme\" content=\"light dark\">\n"
         "<link rel=\"icon\" type=\"image/svg+xml\" href=\"assets/favicon.svg\">\n"
         + head.strip() + "\n</head>\n<body>\n" + body.strip() + "\n</body>\n</html>\n")
(root / "index.html").write_text(index, encoding="utf-8")
print("papers: %d | artifact.html %d KB | index.html %d KB" % (len(papers), len(page) // 1024, len(index) // 1024))

# Worker serves the same page and a small D1-backed interaction API.
dist = root / 'dist' / 'server'
dist.mkdir(parents=True, exist_ok=True)
(dist / 'index.js').write_text((root / 'worker.js').read_text(encoding='utf-8'), encoding='utf-8')
shutil.copyfile(root/'life-api.js',dist/'life-api.js')
module = 'export const PAGE=' + json.dumps(index, ensure_ascii=False) + ';\n'
module += 'export const FAVICON=' + json.dumps((root/'assets/favicon.svg').read_text(encoding='utf-8')) + ';\n'
module += 'export const POST_IDS=' + json.dumps([p['id'] for p in papers + posts]) + ';\n'
module += 'export const FIGURES=' + json.dumps({'/'+p['figure']['src']:p['figure']['imageUrl'] for p in papers if p.get('figure')}) + ';\n'
module += 'export const REPOSITORY_TRIPS=' + script_json(trips) + ';\n'
(dist / 'page.js').write_text(module, encoding='utf-8')
# Small local Life assets have a Worker fallback when the hosting runtime omits ASSETS.
asset_types={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.geojson':'application/geo+json','.json':'application/json','.txt':'text/plain; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'}
extras={}
for folder in ('map','vendor','fishing'):
    for file in (root/'assets'/folder).rglob('*'):
        if file.is_file():
            extras['/'+file.relative_to(root).as_posix()]={'mime':asset_types[file.suffix], 'base64':base64.b64encode(file.read_bytes()).decode()}
(dist/'life-assets.js').write_text('export const LIFE_ASSETS='+json.dumps(extras)+';\n',encoding='utf-8')
worker_config=json.loads((root/'wrangler.json').read_text(encoding='utf-8'))
worker_config['main']='index.js'
worker_config['assets']['directory']='../client'
(dist/'wrangler.json').write_text(json.dumps(worker_config,indent=2),encoding='utf-8')
client = root/'dist/client'
(client/'assets').mkdir(parents=True, exist_ok=True)
(client/'index.html').write_text(index,encoding='utf-8')
shutil.copyfile(root/'assets/favicon.svg',client/'assets/favicon.svg')
if (root/'assets/figures').exists():
    shutil.copytree(root/'assets/figures',client/'assets/figures',dirs_exist_ok=True)
for folder in ('map','vendor','fishing'):
    shutil.copytree(root/'assets'/folder,client/'assets'/folder,dirs_exist_ok=True)


# ---- SEO: crawlable static pages (hash routes are invisible to crawlers), sitemap, robots, IndexNow key
import html as _html, re as _re
SITE = 'https://thinkingline.blog'
def _esc(s): return _html.escape(str(s), quote=True)
def _paras(vals): return ''.join('<p>%s</p>' % _esc(v) for v in (vals or []))
def _ld(obj): return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False).replace('<', '\\u003c') + '</script>'
_fonts = ''.join(_re.findall(r'<link rel="preconnect"[^>]*>|<link rel="stylesheet"[^>]*>', head))
_style = _re.search(r'<style>.*?</style>', head, _re.S).group(0)
TOPIC_NAMES = {'gui-agent': 'GUI agents', 'agent-security': 'Agent security', 'models-methods': 'Models & methods'}
_static_css = ('<style>.static-top{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:22px 0 14px;'
               'border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:13px}.static-top a{color:var(--muted)}'
               '.static-top .b{font:600 20px var(--serif);color:var(--ink)}.static-wrap{max-width:820px;margin:0 auto;padding:0 24px 64px}'
               '.static-meta{font-family:var(--mono);font-size:13px;color:var(--muted);margin:10px 0 18px;line-height:1.7}'
               '.static-meta a{text-decoration:underline}.static-take{font-style:italic;color:var(--muted);margin:0 0 22px}'
               '.static-fig img{max-width:100%;height:auto;display:block;border:1px solid var(--rule)}.static-fig figcaption{font-family:var(--mono);font-size:12px;color:var(--faint);margin-top:8px}'
               '.static-cta{margin:34px 0 0;padding-top:18px;border-top:1px solid var(--rule);font-family:var(--mono);font-size:13px}'
               '.static-list li{margin:0 0 14px}.static-list small{display:block;font-family:var(--mono);font-size:12px;color:var(--faint)}</style>')
def _shell(title, description, canonical, body_html, extra_head=''):
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<meta name="color-scheme" content="light dark">\n<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">\n'
            f'<title>{_esc(title)}</title>\n<meta name="description" content="{_esc(description)}">\n<meta name="author" content="Mingshuo Wang">\n'
            f'<link rel="canonical" href="{canonical}">\n<meta property="og:type" content="article">\n<meta property="og:site_name" content="Thinking Line">\n'
            f'<meta property="og:title" content="{_esc(title)}">\n<meta property="og:description" content="{_esc(description)}">\n<meta property="og:url" content="{canonical}">\n'
            f'{_fonts}\n{_style}\n{_static_css}\n{extra_head}\n</head>\n<body>\n<div class="static-wrap">\n'
            '<header class="static-top"><a class="b" href="/">Thinking Line</a><a href="/">Mingshuo Wang · research notebook</a></header>\n'
            f'{body_html}\n</div>\n</body>\n</html>\n')
notes_dir = client / 'notes'
sitemap_urls = []
latest = max((p.get('date', '') for p in papers), default='')
for p in papers:
    n = p['note']; url = f"{SITE}/notes/{p['id']}/"
    topic = TOPIC_NAMES.get(p.get('topic'), 'Research notes')
    desc = (p.get('take') or ' '.join(n.get('problem', [])[:1]))[:300]
    fig = ''
    if p.get('figure'):
        f = p['figure']
        fig = (f'<figure class="static-fig"><img src="/{_esc(f["src"])}" alt="{_esc(f.get("alt", ""))}" width="{f.get("width", "")}" height="{f.get("height", "")}" loading="lazy">'
               f'<figcaption>{_esc(f.get("figureLabel", "Figure"))} from the paper: {_esc(f.get("caption", ""))} ({_esc(f.get("license", ""))}; '
               f'<a href="{_esc(f.get("sourcePage", p.get("url", "")))}" rel="noopener">source</a>)</figcaption></figure>')
    links = []
    if p.get('arxiv'): links.append(f'<a href="https://arxiv.org/abs/{_esc(p["arxiv"])}" rel="noopener">arXiv:{_esc(p["arxiv"])}</a>')
    if p.get('url') and 'arxiv.org' not in p['url']: links.append(f'<a href="{_esc(p["url"])}" rel="noopener">paper page</a>')
    sections = [('Problem', n.get('problem')), ('Contributions', n.get('contributions')), ('Method', n.get('method')), ('Evaluation', n.get('evaluation'))]
    body = (f'<p class="static-meta"><a href="/#/research/{_esc(p.get("topic", ""))}">{_esc(topic)}</a> · note dated {_esc(p.get("date", ""))}</p>'
            f'<h1 class="title">{_esc(p["title"])}</h1>'
            f'<p class="static-meta">{_esc(p.get("authors", ""))}<br>{_esc(p.get("venue", ""))}' + (' · ' + ' · '.join(links) if links else '') + '</p>'
            + (f'<p class="static-take">{_esc(p["take"])}</p>' if p.get('take') else ''))
    for label, vals in sections:
        if vals:
            body += f'<section class="note-section"><h2>{label}</h2><div class="prose">{_paras(vals)}</div>' + (fig if label == 'Method' else '') + '</section>'
    if n.get('myTake'):
        body += f'<section class="note-section"><h2>My take</h2><div class="prose">{_paras([n["myTake"]])}</div></section>'
    body += f'<p class="static-cta"><a href="/#/post/{_esc(p["id"])}">Open this note in the interactive notebook (comments, hooks) →</a> · <a href="/notes/">All notes</a></p>'
    ld = {'@context': 'https://schema.org', '@type': 'BlogPosting', 'headline': p['title'], 'description': desc, 'url': url, 'mainEntityOfPage': url,
          'datePublished': p.get('date', ''), 'dateModified': p.get('revised') or p.get('date', ''), 'inLanguage': 'en',
          'author': {'@type': 'Person', 'name': 'Mingshuo Wang', 'url': SITE + '/'}, 'isPartOf': {'@type': 'WebSite', 'name': 'Thinking Line', 'url': SITE + '/'},
          'about': {'@type': 'ScholarlyArticle', 'name': p['title'], 'author': p.get('authors', ''), 'url': p.get('url') or (f"https://arxiv.org/abs/{p['arxiv']}" if p.get('arxiv') else '')}}
    (notes_dir / p['id']).mkdir(parents=True, exist_ok=True)
    (notes_dir / p['id'] / 'index.html').write_text(_shell(f"{p['title']} · Thinking Line", desc, url, body, _ld(ld)), encoding='utf-8')
    sitemap_urls.append((url, p.get('date', '')))
# notes index (a plain crawlable list of every note)
items = ''.join(f'<li><a href="/notes/{_esc(p["id"])}/">{_esc(p["title"])}</a><small>{_esc(p.get("authors", ""))} · {_esc(p.get("venue", ""))} · {_esc(TOPIC_NAMES.get(p.get("topic"), ""))}</small></li>'
                for p in sorted(papers, key=lambda q: q.get('date', ''), reverse=True))
(notes_dir / 'index.html').write_text(_shell('Research notes · Thinking Line', "All of Mingshuo Wang's paper notes on GUI agents, agent security and agent systems.", SITE + '/notes/',
    f'<h1 class="title">Research notes</h1><p class="static-meta">{len(papers)} notes · <a href="/#/research">interactive index with search and filters</a></p><ul class="static-list">{items}</ul>'), encoding='utf-8')
sitemap_urls.insert(0, (SITE + '/notes/', latest)); sitemap_urls.insert(0, (SITE + '/', latest))
(client / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ''.join(f'  <url><loc>{u}</loc>' + (f'<lastmod>{d}</lastmod>' if d else '') + '</url>\n' for u, d in sitemap_urls) + '</urlset>\n', encoding='utf-8')
(client / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n', encoding='utf-8')
_key = (root / 'indexnow-key.txt').read_text(encoding='utf-8').strip()
(client / f'{_key}.txt').write_text(_key, encoding='utf-8')
shutil.copyfile(root / 'assets/portrait.jpg', client / 'assets/portrait.jpg')
print('seo: %d note pages, sitemap with %d urls, robots.txt, indexnow key file' % (len(papers), len(sitemap_urls)))
