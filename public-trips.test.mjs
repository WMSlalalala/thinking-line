import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import vm from 'node:vm';

// Independent public-Life regression tests. All generated files stay outside the checkout.
const root=new URL('./',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const lifeSource=read('life.js').replace('__FISHING_JSON__','[]');
const mapSource=read('life-map.js'),apiSource=read('life-api.js'),workerSource=read('worker.js');
const repository=JSON.parse(read('trips.json'));
const clone=x=>JSON.parse(JSON.stringify(x));
const apiOrigin='https://thinking-line.wangmingshuo03.chatgpt.site';
const {lifeApi}=await import('data:text/javascript;base64,'+Buffer.from(apiSource).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const tests=[];const test=(name,fn)=>tests.push({name,fn});

function fixture(){
  const nodes=new Map(),roots=[],network=[],fit=[],madeMarkers=[],madeLines=[];
  const walk=n=>[n,...n.children.flatMap(walk)];
  const sync=()=>{nodes.clear();for(const root of roots)for(const n of walk(root))if(n.id)nodes.set(n.id,n);};
  class Element{
    constructor(tag='div'){this.tagName=tag;this.id='';this.className='';this.children=[];this.attributes={};this.style={};this.hidden=false;this.value='';this.textContent='';}
    set innerHTML(html){this.html=html;this.children=[];const stack=[this],voids=new Set(['input','img','link','meta','br','hr']);
      for(const m of html.matchAll(/<\/?([a-zA-Z][\w-]*)\b[^>]*>/g)){const raw=m[0],tag=m[1].toLowerCase();if(raw.startsWith('</')){const i=stack.findLastIndex(n=>n.tagName===tag);if(i>0)stack.length=i;continue;}
        const n=new Element(tag);for(const a of raw.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g))n.attributes[a[1]]=a[2]||'';
        n.id=n.attributes.id||'';n.className=n.attributes.class||'';n.parentElement=stack.at(-1);n.parentElement.children.push(n);if(!voids.has(tag))stack.push(n);
      }sync();}
    get innerHTML(){return this.html||'';}get parentNode(){return this.parentElement||null;}
    querySelector(s){return walk(this).slice(1).find(n=>s[0]==='.'?n.className.split(/\s+/).includes(s.slice(1)):s[0]==='#'?n.id===s.slice(1):n.tagName===s)||null;}
    appendChild(n){n.remove();n.parentElement=this;this.children.push(n);sync();return n;}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;sync();}
    setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}addEventListener(){}close(){this.open=false;}showModal(){this.open=true;}
  }
  const app=new Element(),head=new Element('head');app.id='app';roots.push(app,head);sync();
  function layer(options={}){return{options,events:{},styles:[],addTo(group){group?.items?.push(this);return this;},on(name,fn){this.events[name]=fn;return this;},setStyle(style){this.styles.push(style);this.style={...this.style,...style};return this;},remove(){this.removed=true;},bringToFront(){return this;}};}
  const map={fitBounds:(bounds,opts)=>fit.push({bounds,opts}),setMinZoom(){},getBoundsZoom:()=>3,getZoom:()=>5,getBounds:()=>({contains:()=>true}),getContainer:()=>nodes.get('travel-map'),latLngToContainerPoint:ll=>({x:ll[1]*100,y:ll[0]*100}),remove(){this.removed=true;}};
  const context={console,URL,AbortSignal,setTimeout,clearTimeout,routeVersion:1,API:apiOrigin,
    esc:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    window:{innerWidth:1200,addEventListener(){},removeEventListener(){}},
    document:{head,getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),querySelector:s=>roots.map(n=>n.querySelector(s)).find(Boolean)||null},
    fetch:async(url,options)=>{network.push({url,options});if(url==='assets/map/trips.json')return{ok:true,json:async()=>clone(repository)};if(url==='assets/map/us-states.geojson')return{ok:true,json:async()=>({features:[]})};if(url===apiOrigin+'/api/life/trips')return{ok:true,json:async()=>({trips:clone(repository)})};throw Error('Unexpected network '+url);},
    L:{polyline:(coords,opts)=>{const l=layer(opts);l.coords=coords;madeLines.push(l);return l;},divIcon:opts=>opts,marker:(coords,opts)=>{const m=layer(opts);m.coords=coords;madeMarkers.push(m);return m;},popup:()=>({setLatLng(){return this;},setContent(){return this;},openOn(){return this;},remove(){}})}
  };
  vm.createContext(context);vm.runInContext(lifeSource+'\n'+mapSource,context);
  context.LIFE.states={features:[]};context.LIFE.trips=clone(repository);
  context.createTravelMap=async generation=>{if(generation!==context.routeVersion)return;context.LIFE.map=map;context.LIFE.routeLayer={items:[],clearLayers(){this.items=[];}};context.updateMapData();};
  app.innerHTML=context.life();context.renderTrips();
  const ready=async()=>{await context.createTravelMap(1);};
  return{context,nodes,head,network,fit,madeMarkers,madeLines,map,app,ready};
}

test('source contains no frontend login, editor UI, file input or write path',()=>{
  for(const pattern of [/signin-with-chatgpt/i,/\b(saveTrip|chooseCity|uploadTripPhotos|renderEditor|deleteTrip)\s*\(/,/type=["']file["']/i,/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i,/\/api\/life\/(?:session|places)/,/href=["'][^"']*life\/edit/])assert.doesNotMatch(lifeSource+'\n'+mapSource,pattern);
  const f=fixture();assert.doesNotMatch(f.nodes.get('life-content').innerHTML,/<form\b|sign in|save route|add route/i);
});
test('all source routes have unique IDs, distinct colors, ordered stops and valid geometry (loops closed)',()=>{
  assert.equal(repository.length,4);assert.equal(new Set(repository.map(t=>t.id)).size,4);assert.equal(new Set(repository.map(t=>t.color)).size,4);
  for(const t of repository){assert.equal(t.managed,true);assert.equal(t.geometry.type,'LineString');assert.ok(t.geometry.coordinates.length>t.points.length);if(t.loop===false){assert.notDeepEqual(t.geometry.coordinates[0],t.geometry.coordinates.at(-1))}else{assert.deepEqual(t.geometry.coordinates[0],t.geometry.coordinates.at(-1));assert.equal(t.points[0].lat,t.points.at(-1).lat);assert.equal(t.points[0].lng,t.points.at(-1).lng));assert.ok(t.points.every(p=>p.id&&p.label));for(const p of t.geometry.coordinates)assert.ok(p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85);}
});
test('map uses routed geometry in Leaflet latitude/longitude order and draws every closure',async()=>{
  const f=fixture();await f.ready();assert.equal(f.context.LIFE.lines.length,4);
  repository.forEach((t,i)=>{const line=f.context.LIFE.lines[i].line;assert.equal(line.coords.length,t.geometry.coordinates.length);assert.deepEqual(clone(line.coords[0]),t.geometry.coordinates[0].slice().reverse());if(t.loop!==false)assert.deepEqual(clone(line.coords.at(-1)),clone(line.coords[0]));});
});
test('closed loop ending does not produce duplicate stop markers and all markers are display-only',async()=>{
  const f=fixture();await f.ready();assert.equal(f.context.LIFE.markers.length,repository.reduce((n,t)=>n+(t.loop===false?t.points.length:t.points.length-1),0));
  f.context.LIFE.markers.forEach(m=>{assert.equal(m.options.draggable,false);assert.equal(m.options.keyboard,true);assert.equal(m.options.bubblingMouseEvents,false);assert.equal(m.events.dragend,undefined);});
});
test('route hover highlights one route and mouseout restores the selected route',async()=>{
  const f=fixture();await f.ready();f.context.LIFE.selected=repository[0].id;const hovered=f.context.LIFE.lines[1];hovered.line.events.mouseover({latlng:{lng:-80,lat:35}});
  assert.equal(hovered.line.style.weight,5);assert.equal(f.context.LIFE.lines[0].line.style.opacity,.23);
  hovered.line.events.mouseout();assert.equal(f.context.LIFE.lines[0].line.style.weight,5);assert.equal(f.context.LIFE.lines[1].line.style.opacity,.23);
});
test('route line and stop marker click select matching route with full geometry fitting',async()=>{
  const f=fixture();await f.ready();f.context.LIFE.lines[1].line.events.click();assert.equal(f.context.LIFE.selected,repository[1].id);assert.equal(f.fit.at(-1).bounds.length,repository[1].geometry.coordinates.length);assert.equal(f.context.LIFE.markers.length,repository[1].points.length-1);assert.match(f.nodes.get('trip-detail').innerHTML,/Las Vegas, NV/);
  f.context.LIFE.selected=null;f.context.updateMapData();f.context.LIFE.markers.at(-1).events.click();assert.equal(f.context.LIFE.selected,repository[2].id);
});
test('US overview clears selected detail and returns all routes to normal emphasis',async()=>{
  const f=fixture();await f.ready();f.context.selectTrip(repository[1].id);f.context.handleLifeClick({target:{closest:s=>s==='[data-camera]'?{}:null}});assert.equal(f.context.LIFE.selected,null);assert.equal(f.nodes.get('trip-detail').innerHTML,'');assert.equal(f.context.LIFE.overview,true);f.context.LIFE.lines.forEach(l=>assert.equal(l.line.style.opacity,.95));
});
test('city atlas labels have no editing click handlers and no keyboard focus',async()=>{
  const f=fixture();await f.ready();f.context.LIFE.atlasLabels={clearLayers(){}};f.context.LIFE.cities={features:[{properties:{NAME:'Boston',POP_MAX:100,MIN_ZOOM:1},geometry:{coordinates:[-71,42]}}]};const before=f.madeMarkers.length;f.context.drawAtlasLabels();const marker=f.madeMarkers[before];assert.equal(marker.options.interactive,false);assert.equal(marker.options.keyboard,false);assert.equal(marker.events.click,undefined);
});
test('public loading makes GET-only anonymous requests, with static source data preserved',async()=>{
  const f=fixture();await f.context.wireLife(1);await tick();assert.equal(f.context.LIFE.trips.length,4);assert.deepEqual(clone(f.context.LIFE.trips.map(t=>t.geometry)),repository.map(t=>t.geometry));
  for(const call of f.network){assert.ok(!call.options?.method||call.options.method==='GET');assert.notEqual(call.options?.credentials,'include');assert.doesNotMatch(call.url,/session|signin|places/);}
  assert.equal(f.network.find(c=>c.url.startsWith(apiOrigin)).options.credentials,'omit');
});
test('late backend photos refresh selected gallery without resetting its camera',async()=>{
  const f=fixture();let resolveApi;f.context.lifeRequest=()=>new Promise(resolve=>resolveApi=resolve);await f.context.wireLife(1);f.context.selectTrip(repository[0].id);const fits=f.fit.length;
  const stored=clone(repository);stored[0].photos=[{id:'photo-review',url:'/media/photo-review',caption:'A trip photo'}];resolveApi({trips:stored});await tick();assert.match(f.nodes.get('trip-detail').innerHTML,/\/media\/photo-review/);assert.equal(f.fit.length,fits);
});
test('stale backend response after navigation cannot mutate a new view',async()=>{
  const f=fixture();let resolveApi;f.context.lifeRequest=()=>new Promise(resolve=>resolveApi=resolve);await f.context.wireLife(1);f.context.routeVersion++;const before=clone(f.context.LIFE.trips);resolveApi({trips:[]});await tick();assert.deepEqual(clone(f.context.LIFE.trips),before);
});
test('backend merges uploaded photos into repository routes without overriding source geometry',async()=>{
  const t=repository[0],photo={id:'2adbe10f-c966-435f-9f5f-a193c45ed46c',trip:t.id,width:800,height:600,caption:'Stored image',stop:t.points[1].id,status:'ready'};
  const rows=[{...t,title:'Older DB title',points:JSON.stringify(t.points),states:JSON.stringify(t.states)}];
  const DB={prepare:sql=>({bind(){return this;},all:async()=>({results:sql.includes('FROM life_photos')?[photo]:rows})})};
  const response=await lifeApi(new Request(apiOrigin+'/api/life/trips'),{DB},clone(repository));assert.equal(response.status,200);const data=await response.json();assert.equal(data.trips.length,3);assert.equal(data.trips[0].title,t.title);assert.deepEqual(data.trips[0].geometry,t.geometry);assert.equal(data.trips[0].photos[0]?.id,photo.id);assert.equal(data.trips[0].photos[0]?.stopId,photo.stop);
});
test('backend serves repository trips even when D1 is unavailable',async()=>{
  const response=await lifeApi(new Request(apiOrigin+'/api/life/trips'),{},repository);assert.equal(response.status,200);assert.deepEqual((await response.json()).trips,repository);
});
test('Worker forwards repository trips to Life API and public GET CORS remains valid',async()=>{
  const context={Response,Request,URL,Set,Uint8Array,atob,REPOSITORY_TRIPS:repository,POST_IDS:[],PAGE:'',FAVICON:'',FIGURES:{},LIFE_ASSETS:{},lifeApi};vm.createContext(context);vm.runInContext(workerSource.replace(/^import .*;\r?\n/gm,'').replace('export default','globalThis.worker ='),context);
  const response=await context.worker.fetch(new Request(apiOrigin+'/api/life/trips',{headers:{Origin:'https://wmslalalala.github.io'}}),{});assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://wmslalalala.github.io');assert.deepEqual((await response.json()).trips,repository);
});
for(const first of ['css','js'])test(`Leaflet waits for both assets when ${first} loads first`,async()=>{
  const f=fixture();let ready=false;const promise=f.context.loadMapLibrary().then(()=>ready=true),css=f.nodes.get('leaflet-css'),js=f.head.children.find(n=>n.tagName==='script');(first==='css'?css:js).onload();await tick();assert.equal(ready,false);(first==='css'?js:css).onload();await promise;assert.equal(ready,true);
});
test('isolated build emits identical repository trips into client asset and Worker module',async()=>{
  const scratch=mkdtempSync(new URL('./public-trips-build-',import.meta.url).pathname.replace(/^\/(\w):/,'$1:'));
  for(const folder of ['assets/map','assets/vendor','assets/fishing'])mkdirSync(join(scratch,folder),{recursive:true});
  for(const name of ['build.py','worker.js','life-api.js','life.js','life-map.js','life.css','wrangler.json','trips.json'])copyFileSync(new URL(name,root),join(scratch,name));
  writeFileSync(join(scratch,'template.html'),'__LIFE_CSS__<!-- /head -->__LIFE_JS__\n__LIFE_MAP_JS__\n__SHARED_JS__\n__PAPERS_JSON__\n__POSTS_JSON__');
  for(const name of ['papers.json','posts.json','fishing.json'])writeFileSync(join(scratch,name),'[]');writeFileSync(join(scratch,'shared.js'),'');writeFileSync(join(scratch,'assets/portrait.jpg'),'unused');writeFileSync(join(scratch,'assets/favicon.svg'),'<svg/>');
  execFileSync('C:/Users/42836/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-X','utf8',join(scratch,'build.py')],{stdio:'pipe'});
  assert.deepEqual(JSON.parse(readFileSync(join(scratch,'dist/client/assets/map/trips.json'),'utf8')),repository);
  const {REPOSITORY_TRIPS}=await import('data:text/javascript;base64,'+readFileSync(join(scratch,'dist/server/page.js')).toString('base64'));assert.deepEqual(REPOSITORY_TRIPS,repository);
  const {LIFE_ASSETS}=await import('data:text/javascript;base64,'+readFileSync(join(scratch,'dist/server/life-assets.js')).toString('base64'));assert.deepEqual(JSON.parse(Buffer.from(LIFE_ASSETS['/assets/map/trips.json'].base64,'base64').toString()),repository);
  const bad=clone(repository);bad[0].geometry.coordinates.pop();writeFileSync(join(scratch,'trips.json'),JSON.stringify(bad));assert.throws(()=>execFileSync('C:/Users/42836/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-X','utf8',join(scratch,'build.py')],{stdio:'pipe'}),/must close into a loop/);
});

let failed=0;for(const {name,fn} of tests){try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n  '+error.stack);}}
console.log(`${tests.length-failed}/${tests.length} public trips tests passed.`);if(failed)process.exitCode=1;
