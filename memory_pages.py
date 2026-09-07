"""Research collection views, with no client library or build dependencies."""
import html, json, textwrap, re

def esc(value): return html.escape(str(value), quote=True)

def collection_link():
    return '<a class="memory-link" href="/research/gui-memory/"><span><strong>GUI memory · research atlas</strong><small>45 P0 papers · 10 branches · detailed notes in 中文</small></span><span class="arrow" aria-hidden="true">↗</span></a>'

def reading_html(p):
    n=p.get('readingNote')
    if not n:return ''
    # Static URLs keep section navigation independent of the notebook's hash router.
    toc=''.join(f'<li><a href="/notes/{esc(p["id"])}/#{esc(s["id"])}">{esc(s["text"])}</a></li>' for s in n['toc'])
    return (f'<section class="reading-full" lang="zh-CN" aria-label="Detailed reading notes in Chinese"><h2 class="reading-title">详细阅读笔记 <small>· {esc(p["readingId"])}</small></h2>'
        '<div class="reading-nav"><a href="/research/gui-memory/">← 45篇P0分类树</a>'
        f'<a href="/notes/{esc(p["id"])}/#detailed-notes">独立阅读页 / Reading view</a></div>'
        f'<p class="reading-context">{esc(n["context"])}</p><details class="reading-toc"><summary>目录 / Contents</summary><ul>{toc}</ul></details>'
        f'<div class="reading-content">{n["html"]}</div></section>')

TREE_SCRIPT = r'''<script>
(() => {
 const q=document.getElementById('tree-search'), status=document.getElementById('tree-status');
 const leaves=[...document.querySelectorAll('.tree-paper')], categories=[...document.querySelectorAll('.tree-category')];
 let savedOpen=null;
 function filter(){
   const words=q.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
   if(words.length && !savedOpen)savedOpen=categories.map(c=>c.querySelector('details').open);
   let count=0;
   leaves.forEach(p=>{p.hidden=!words.every(w=>p.dataset.search.includes(w));if(!p.hidden)count++});
   categories.forEach((c,i)=>{const n=[...c.querySelectorAll('.tree-paper')].filter(p=>!p.hidden).length;c.hidden=!n;
     c.querySelector('.count').textContent=n+' 篇';if(words.length && n)c.querySelector('details').open=true;
     else if(!words.length && savedOpen)c.querySelector('details').open=savedOpen[i]});
   document.querySelectorAll('.tree-branch').forEach(b=>b.hidden=![...b.querySelectorAll('.tree-category')].some(c=>!c.hidden));
   status.textContent=words.length?count+' / 45 篇匹配'+(count?'':' · 试试其他关键词或清空搜索'):'45 篇 · 展开分支，点击论文阅读完整方法与实验';
   if(!words.length)savedOpen=null;
 }
 q.addEventListener('input',filter);
 document.querySelectorAll('[data-tree-open]').forEach(b=>b.addEventListener('click',()=>{
    const open=b.dataset.treeOpen==='true';categories.forEach(c=>{if(!c.hidden)c.querySelector('details').open=open});
    if(savedOpen)savedOpen=categories.map(c=>c.querySelector('details').open);
 }));
 filter();
})();
</script>'''

def taxonomy_body(data):
    papers=data['papers'];branches=[]
    for parent in data['categories']:
        children=[]
        for cat in parent['children']:
            items=[]
            for rid in cat['paper_ids']:
                p=papers[rid]
                search=' '.join([rid,p['short_name'],p['title'],p['mechanism'],cat['name'],parent['name']]+p['tags']).lower()
                items.append(f'<li class="tree-paper" data-paper="{esc(rid)}" data-search="{esc(search)}"><a href="{esc(p["note_url"])}"><span class="paper-id">{esc(rid)} · {esc(p["type"])}</span>{esc(p["short_name"])}</a><p>{esc(p["mechanism"])}</p><span class="cross-tags">{esc(" · ".join(p["tags"]))}</span></li>')
            current=cat['slug']==data['our_method']['primary_category']
            marker='<span class="current-marker">● 当前方案所在分支 / Our current direction</span>' if current else ''
            children.append(f'<li class="tree-category{" current" if current else ""}" id="{esc(cat["slug"])}"><details><summary><strong>{esc(cat["name"])}<span class="count">{cat["count"]} 篇</span>{marker}</strong><span class="question">{esc(cat["question"])}</span></summary><div class="category-body"><p class="category-description">{esc(cat["description"])}</p><ul class="tree-papers">{"".join(items)}</ul></div></details></li>')
        label='01 · METHODS · 33 PAPERS' if parent['slug']=='methods' else '02 · EVALUATION · 12 PAPERS'
        short='怎样保存、找到并使用历史' if parent['slug']=='methods' else '怎样知道历史真的有用'
        branches.append(f'<section class="tree-branch" data-branch="{esc(parent["slug"])}"><h2 class="branch-heading"><small>{label}</small>{short}</h2><p class="branch-desc">{esc(parent["description"])}</p><ul class="tree-categories">{"".join(children)}</ul></section>')
    ours=data['our_method']
    related=' · '.join(f'<a href="{esc(papers[rid]["note_url"])}">{esc(papers[rid]["short_name"])}</a>' for rid in ['P052','Y26-090','Y26-113','SUP-A01','SUP-A27','SUP-R02'])
    # Only publish a short placement note, rather than the private implementation draft.
    return ('<p class="memory-kicker">Field notes / 2026.09.07 / Priority reading</p><h1>GUI 历史记忆研究分类树</h1>'
      '<p class="memory-intro" lang="zh-CN">旧页面上的信息，怎样留到后面用？这张图按“保存什么、怎么找、怎么用、怎么验证”整理本轮论文。先看分支解决的问题，再展开到具体论文。</p>'
      '<div class="memory-stats"><div><strong>45</strong><span>篇 P0 阅读笔记</span></div><div><strong>10</strong><span>研究分支</span></div><div><strong>33 / 12</strong><span>方法 / 评测与分析</span></div></div>'
      '<div class="tree-toolbar"><label class="sr" for="tree-search">搜索论文、机制或关键词</label><input id="tree-search" type="search" placeholder="搜索：ReadAgent、摘要、跨任务、视觉……" autocomplete="off"><button type="button" data-tree-open="true">全部展开</button><button type="button" data-tree-open="false">收起</button><a href="/assets/gui-memory/taxonomy.svg" download="gui-memory-taxonomy.svg">下载分类图 ↗</a></div><p id="tree-status" class="tree-status" role="status" aria-live="polite"></p>'
      '<div class="taxonomy-tree" lang="zh-CN"><div class="tree-root">GUI 历史与记忆<small>WHAT TO KEEP · FIND · USE · TEST</small></div><div class="tree-branches">'+''.join(branches)+'</div></div>'
      '<section class="our-position" lang="zh-CN" id="our-direction"><span class="memory-kicker">Our current direction</span><h2>我们的位置：目录与底稿分存，按需回查</h2>'
      f'<p class="status">{esc(ours["status"])}</p><p>{esc(ours["mechanism"])}</p><p>{esc(ours["limit"])}</p>'
      f'<p>最直接相邻：{related}。</p><p>{esc(ours["relationship_note"])}</p></section>'
      f'<p class="taxonomy-note">{esc(data["classification_note"])} 中文详解保留论文版本、原图、结果表和核查边界；复现建议与自拟例子均在笔记中区分。</p>'
      '<p class="static-cta"><a href="/#/research/gui-agent">← GUI agents</a> · <a href="/notes/">All research notes</a></p>'+TREE_SCRIPT)

def taxonomy_svg(data):
    """Portable vector overview; the webpage provides the expanded accessible tree."""
    out=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1760" viewBox="0 0 1440 1760" role="img" aria-labelledby="title desc"><title id="title">GUI 历史记忆研究分类树 · 45 P0</title><desc id="desc">33篇方法分为7类，12篇评测分为3类。每篇恰好出现一次；绿色描边标出当前方案所属分支。</desc><rect width="1440" height="1760" fill="#faf8f2"/><style>text{font-family:Arial,"Noto Sans CJK SC","Microsoft YaHei",sans-serif;fill:#292f29}.line{fill:none;stroke:#bdc6ba;stroke-width:1.5}.small{font-size:15px;fill:#697267}.names{font-size:16px;fill:#454f43}.title{font-size:23px;font-weight:600}</style><text x="42" y="53" font-size="32" font-weight="600">GUI 历史记忆研究分类树</text><text x="43" y="82" class="small">45篇 P0 · 10个分支 · 2026-09-07 · Thinking Line</text>']
    out.append('<path class="line" d="M256 855 H295 V600 H330 M295 855 V1438 H330"/><rect x="38" y="810" width="218" height="88" rx="6" fill="#e6ece3" stroke="#bac7b6"/><text x="60" y="848" font-size="23" font-weight="600">GUI 历史与记忆</text><text x="60" y="875" class="small">保存 → 查找 → 使用</text>')
    def wrap_names(names,units=76):
        lines=[];line='';width=0
        for ch in ' · '.join(names):
            n=2 if ord(ch)>255 else 1
            if width+n>units:lines.append(line);line='';width=0
            line+=ch;width+=n
        if line:lines.append(line)
        return lines
    for branch,ys,bmid in [(data['categories'][0],[130+150*i for i in range(7)],600),(data['categories'][1],[1260+150*i for i in range(3)],1438)]:
        method=branch['slug']=='methods';fill='#eaf1e9' if method else '#f1eade';word='方法' if method else '评测与分析'
        out.append(f'<rect x="330" y="{bmid-42}" width="185" height="84" rx="6" fill="{fill}" stroke="#bfc8ba"/><text x="350" y="{bmid-6}" font-size="22" font-weight="600">{word}</text><text x="350" y="{bmid+21}" class="small">{branch["count"]} papers</text>')
        for cat,y in zip(branch['children'],ys):
            current=cat['slug']=='source-lookback';stroke='#47705a' if current else '#d2d7ca'
            out.append(f'<path class="line" d="M515 {bmid} H548 V{y+60} H580"/><rect x="580" y="{y}" width="818" height="128" rx="5" fill="#ffffff" stroke="{stroke}" stroke-width="{2 if current else 1}"/><text x="600" y="{y+28}" class="title">{esc(cat["name"])} · {cat["count"]}</text>')
            question=cat['question']+('  ← 当前方案' if current else '')
            out.append(f'<text x="600" y="{y+53}" class="small">{esc(question)}</text>')
            for i,line in enumerate(wrap_names([data['papers'][r]['short_name'] for r in cat['paper_ids']])):
                out.append(f'<text x="600" y="{y+78+i*20}" class="names">{esc(line)}</text>')
    out.append('<text x="42" y="1733" class="small">阅读导航分类，非排他的学术谱系；P0为阅读优先级。拟议方案尚无实验结果。完整笔记：thinkingline.blog/research/gui-memory/</text></svg>')
    return ''.join(out)
