import { PAGE, FAVICON, POST_IDS, FIGURES, REPOSITORY_TRIPS } from './page.js';
import { lifeApi } from './life-api.js';
import { LIFE_ASSETS } from './life-assets.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const origins = new Set(['https://thinking-line.wangmingshuo03.chatgpt.site', 'https://wmslalalala.github.io', 'http://127.0.0.1:8127']);
const knownPosts = new Set(POST_IDS);
const json = (data,status=200,headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const first = (db,sql,...args) => db.prepare(sql).bind(...args).first();
const all = async (db,sql,...args) => (await db.prepare(sql).bind(...args).all()).results;
const count = async (db,table,post) => Number((await first(db,`SELECT COUNT(*) AS n FROM ${table} WHERE post = ?`,post)).n);
async function throttle(db,key,limit,expires){
  return !!await first(db,'INSERT INTO rate_windows (key, count, expires) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count',key,expires,limit);
}
async function networkKey(request,now){
  const ip=request.headers.get('CF-Connecting-IP');if(!ip)return null;
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(Math.floor(now/86400000)+':thinking-line:'+ip));
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}

async function bodyOf(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new Error('Please send JSON.');
  if(Number(request.headers.get('Content-Length')||0)>10000)throw new Error('Request is too large.');
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing request.');
  const chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>10000){await reader.cancel();throw new Error('Request is too large.')}chunks.push(value)}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  const raw=new TextDecoder().decode(bytes);
  const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid request.');
  return body;
}

async function api(request,env){
  const url=new URL(request.url), parts=url.pathname.split('/').filter(Boolean);
  const action=parts[1], post=parts[2], method=request.method;
  const db=env.DB;
  if(!db)return json({error:'Comments are temporarily unavailable.'},503);
  if(method==='GET'&&action==='health')return json({ok:true});
  if(method==='GET'&&action==='summary'){
    const [reads,hooks,comments,visits]=await Promise.all([
      all(db,'SELECT post, COUNT(*) AS n FROM views GROUP BY post'),
      all(db,'SELECT post, COUNT(*) AS n FROM hooks GROUP BY post'),
      all(db,'SELECT post, COUNT(*) AS n FROM comments GROUP BY post'),
      first(db,'SELECT COUNT(*) AS n FROM visits')]);
    const stats={};for(const id of POST_IDS)stats[id]={views:0,hooks:0,comments:0};
    for(const [key,rows] of [['views',reads],['hooks',hooks],['comments',comments]])for(const r of rows)if(stats[r.post])stats[r.post][key]=Number(r.n);
    return json({stats,visits:Number(visits.n)});
  }
  if(method==='POST'&&action==='visit'){
    let b;try{b=await bodyOf(request)}catch{return json({error:'Invalid visit.'},400)}
    if(!UUID.test(b.visit||''))return json({error:'Invalid visit.'},400);
    await db.prepare('INSERT OR IGNORE INTO visits (visit, created) VALUES (?, ?)').bind(b.visit,Date.now()).run();
    return json({visits:Number((await first(db,'SELECT COUNT(*) AS n FROM visits')).n)});
  }
  if(!knownPosts.has(post))return json({error:'Note not found.'},404);
  if(method==='GET'&&action==='post'){
    const visitor=url.searchParams.get('visitor');
    const [views,hooks,comments,hooked,commentCount]=await Promise.all([
      count(db,'views',post),count(db,'hooks',post),
      all(db,'SELECT id, name, body, created AS ts FROM comments WHERE post = ? ORDER BY created DESC LIMIT 300',post),
      UUID.test(visitor||'')?first(db,'SELECT 1 AS yes FROM hooks WHERE post = ? AND visitor = ?',post,visitor):null,count(db,'comments',post)]);
    return json({views,hooks,comments:comments.reverse(),commentCount,hooked:!!hooked});
  }
  let b;try{b=await bodyOf(request)}catch{return json({error:'Invalid request.'},400)}
  if(method==='POST'&&action==='view'){
    if(!UUID.test(b.visit||''))return json({error:'Invalid visit.'},400);
    await db.prepare('INSERT OR IGNORE INTO views (post, visit, created) VALUES (?, ?, ?)').bind(post,b.visit,Date.now()).run();
    return json({views:await count(db,'views',post)});
  }
  if(!UUID.test(b.visitor||''))return json({error:'Invalid visitor.'},400);
  if(method==='PUT'&&action==='hook'){
    if(typeof b.hooked!=='boolean')return json({error:'Invalid hook.'},400);
    if(b.hooked)await db.prepare('INSERT OR IGNORE INTO hooks (post, visitor) VALUES (?, ?)').bind(post,b.visitor).run();
    else await db.prepare('DELETE FROM hooks WHERE post = ? AND visitor = ?').bind(post,b.visitor).run();
    return json({hooks:await count(db,'hooks',post),hooked:b.hooked});
  }
  if(method==='POST'&&action==='comment'){
    if(b.website)return json({error:'Unable to post this comment.'},400);
    if(typeof b.body!=='string'||!b.body.trim()||b.body.length>1500||typeof b.name!=='string'||b.name.length>40||!UUID.test(b.requestId||''))return json({error:'Please enter a comment of 1–1,500 characters and a name of up to 40 characters.'},400);
    const existing=await first(db,'SELECT id, post, visitor, name, body FROM comments WHERE id = ?',b.requestId);
    if(existing){if(existing.post!==post||existing.visitor!==b.visitor||existing.name!==(b.name.trim()||'Anonymous')||existing.body!==b.body.trim())return json({error:'This request already saved different text. Please submit again.'},409);return json({ok:true,id:b.requestId})}
    const last=await first(db,'SELECT created FROM comments WHERE visitor = ? ORDER BY created DESC LIMIT 1',b.visitor);
    if(last&&Date.now()-Number(last.created)<15000)return json({error:'Please wait a few seconds before posting again.'},429);
    const now=Date.now(),net=await networkKey(request,now);
    if(!await throttle(db,'visitor:'+b.visitor+':'+Math.floor(now/15000),1,now+60000))return json({error:'Please wait a few seconds before posting again.'},429);
    if(net&&!await throttle(db,'network:'+net+':'+Math.floor(now/60000),3,now+120000))return json({error:'Too many comments just now. Please try again in a minute.'},429);
    await db.prepare('DELETE FROM rate_windows WHERE expires < ?').bind(now).run();
    await db.prepare('INSERT INTO comments (id, post, visitor, name, body, created) VALUES (?, ?, ?, ?, ?, ?)').bind(b.requestId,post,b.visitor,b.name.trim()||'Anonymous',b.body.trim(),Date.now()).run();
    return json({ok:true,id:b.requestId},201);
  }
  return json({error:'Method not allowed.'},405);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url), origin=request.headers.get('Origin');
    if(url.pathname.startsWith('/api/life/')||url.pathname.startsWith('/media/')){
      const same=origin===url.origin;
      if(origin&&!same&&!origins.has(origin))return json({error:'Origin not allowed.'},403);
      if(url.pathname==='/api/life/session'&&origin&&!same)return json({error:'Open Thinking Line to sign in.'},403);
      if(request.method==='OPTIONS'){
        if(!same)return json({error:'Open the editor on Thinking Line.'},403);
        return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Life-Edit'}});
      }
      const response=await lifeApi(request,env,REPOSITORY_TRIPS);
      if(origin&&url.pathname!=='/api/life/session'){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin')}
      return response;
    }
    if(url.pathname.startsWith('/api/')){
      if(origin&&!origins.has(origin)&&origin!==url.origin)return json({error:'Origin not allowed.'},403);
      const cors=origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'3600'}});
      let response;try{response=await api(request,env)}catch{response=json({error:'The service is temporarily unavailable. Your text has not been cleared.'},503)}
      for(const [k,v] of Object.entries(cors))response.headers.set(k,v);
      return response;
    }
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
    if(LIFE_ASSETS[url.pathname]){
      if(env.ASSETS){const asset=await env.ASSETS.fetch(request);if(asset.ok)return asset}
      const asset=LIFE_ASSETS[url.pathname];
      return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.mime,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    }
    if(FIGURES[url.pathname]){
      if(env.ASSETS){const asset=await env.ASSETS.fetch(request);if(asset.ok)return asset}
      const upstream=await fetch(FIGURES[url.pathname],{cf:{cacheTtl:86400,cacheEverything:true}});
      if(!upstream.ok)return new Response('Figure temporarily unavailable',{status:503});
      return new Response(request.method==='HEAD'?null:upstream.body,{headers:{'Content-Type':upstream.headers.get('Content-Type')||'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
    }
    if(url.pathname==='/assets/favicon.svg')return new Response(request.method==='HEAD'?null:FAVICON,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=86400'}});
    if(url.pathname!=='/'&&url.pathname!=='/index.html')return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD'?null:PAGE,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
  }
};
