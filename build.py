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
    if coordinates[0] != coordinates[-1]:
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
