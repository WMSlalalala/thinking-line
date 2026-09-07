"""Verify the published collection, links, and source boundaries after a build."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, re, unittest, xml.etree.ElementTree as ET

ROOT=Path(__file__).parent
CLIENT=ROOT/'dist/client'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__();self.links=[];self.ids=set();self.paper_ids=[];self.scripts=[];self.handlers=[];self.images=[];self.langs=[]
        self.feed(text)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'): self.ids.add(a['id'])
        if a.get('data-paper'): self.paper_ids.append(a['data-paper'])
        if a.get('lang'): self.langs.append(a['lang'])
        if tag=='img':self.images.append(a)
        if tag=='script':self.scripts.append(a)
        self.handlers.extend(k for k in a if k.lower().startswith('on'))
        for key in ('href','src'):
            if a.get(key):self.links.append(a[key])

class CollectionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/'gui-memory.json').read_text(encoding='utf-8'))
        cls.papers=json.loads((ROOT/'papers.json').read_text(encoding='utf-8'))
        cls.by={p['id']:p for p in cls.papers}
        cls.html=(CLIENT/'research/gui-memory/index.html').read_text(encoding='utf-8')
    def test_exact_coverage_and_links(self):
        categories=[c for b in self.data['categories'] for c in b['children']]
        ids=[i for c in categories for i in c['paper_ids']]
        self.assertEqual(len(categories),10);self.assertEqual(len(ids),45);self.assertEqual(len(set(ids)),45)
        self.assertEqual(set(ids),set(self.data['papers']))
        self.assertEqual(set(Page(self.html).paper_ids),set(ids))
        self.assertEqual(len(self.by),len(self.papers))
        for rid,p in self.data['papers'].items():
            note=self.by[p['blog_id']];self.assertEqual(note['readingId'],rid)
            self.assertEqual(note['priority'],'P0');self.assertGreater(len(note['readingNote']['html']),1000)
            self.assertTrue((CLIENT/p['note_url'].lstrip('/')/'index.html').exists())
    def test_full_notes_are_safe_and_rendered(self):
        for p in self.papers:
            if not p.get('readingNote'):continue
            with self.subTest(id=p['id']):
                n=p['readingNote'];page=Page(n['html'])
                self.assertFalse(page.scripts);self.assertFalse(page.handlers)
                rendered=(CLIENT/'notes'/p['id']/'index.html').read_text(encoding='utf-8')
                self.assertIn(n['html'],rendered);self.assertIn('zh-CN',rendered)
                for heading in n['toc']:self.assertIn(heading['id'],page.ids)
                for img in page.images:self.assertTrue(img.get('alt'))
                for link in page.links:self.assertFalse(re.match(r'(?i)\s*(javascript|vbscript|data):',link))
    def test_local_links_and_fragments(self):
        targets=[CLIENT/'research/gui-memory/index.html']
        targets += [CLIENT/'notes'/p['id']/'index.html' for p in self.papers if p.get('readingNote')]
        targets += list((CLIENT/'assets/gui-memory').rglob('*.html'))
        for file in targets:
            parsed=Page(file.read_text(encoding='utf-8'))
            for link in parsed.links:
                u=urlsplit(link)
                if u.scheme or u.netloc:continue
                target=(CLIENT/unquote(u.path.lstrip('/'))) if u.path.startswith('/') else file.parent/unquote(u.path)
                if not u.path: target=file
                if target.is_dir():target=target/'index.html'
                self.assertTrue(target.is_file(),f'{file.relative_to(CLIENT)} → {link}')
                if u.fragment and not u.fragment.startswith('/') and target.suffix=='.html':
                    self.assertIn(unquote(u.fragment),Page(target.read_text(encoding='utf-8')).ids,f'{file.name} → {link}')
    def test_public_boundary_and_navigation(self):
        public=json.dumps(self.data,ensure_ascii=False)
        self.assertNotRegex(public,r'(?i)C:[/\\]|note_path|source_index|method_source')
        for file in (CLIENT/'assets/gui-memory').rglob('*'):
            self.assertNotEqual(file.suffix,'.json','Raw source caches must not be published')
        for file in [CLIENT/'index.html',CLIENT/'notes/index.html',CLIENT/'sitemap.xml']:
            self.assertIn('/research/gui-memory/',file.read_text(encoding='utf-8'))
        self.assertEqual(self.data['our_method']['primary_category'],'source-lookback')
        self.assertIn('尚未',self.data['our_method']['status'])
        svg=ET.parse(CLIENT/'assets/gui-memory/taxonomy.svg').getroot()
        self.assertTrue(svg.tag.endswith('svg'))
        self.assertNotRegex((CLIENT/'index.html').read_text(encoding='utf-8'),r'__[A-Z_]+__')

if __name__=='__main__':unittest.main()
