const SITE='https://thinking-line.wangmingshuo03.chatgpt.site';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const MAX_PHOTO=10*1024*1024;
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function identity(request){const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');return id&&email?{id,email}:null}
// These headers are supplied by Sites authentication; public incoming copies are stripped.
// OWNER_EMAIL is an explicit server-side allowlist from the Site owner's verified account.
function configured(env){return !!(env.OWNER_USER_ID||env.OWNER_EMAIL)}
function permitted(user,env){return !!user&&(env.OWNER_USER_ID?user.id===env.OWNER_USER_ID:!!env.OWNER_EMAIL&&user.email.toLowerCase()===env.OWNER_EMAIL.toLowerCase())}
function owner(request,env){
  const user=identity(request);if(!user)throw fail('Sign in to manage your trips.',401);
  if(!configured(env))throw fail('Trip editing is being connected to the owner account.',503);
  if(!permitted(user,env))throw fail('Only the site owner can edit trips.',403);
  if(request.headers.get('Origin')!==SITE||request.headers.get('X-Life-Edit')!=='1'||['cross-site','same-site'].includes(request.headers.get('Sec-Fetch-Site')))throw fail('Open the trip editor on Thinking Line to make changes.',403);
  return user;
}
async function bytes(request,limit){
  if(Number(request.headers.get('Content-Length'))>limit)throw fail('This upload is too large.',413);
  const reader=request.body?.getReader();if(!reader)throw fail('The request is empty.');
  let size=0;const parts=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw fail('This upload is too large.',413)}parts.push(value)}
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result;
}
async function jsonBody(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw fail('Send a JSON request.');
  try{return JSON.parse(new TextDecoder().decode(await bytes(request,100*1024)))}catch(error){if(error.status)throw error;throw fail('The request could not be read.')}
}
const digest=async(data)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
function cleanTrip(b){
  if(!b||typeof b!=='object'||Array.isArray(b))throw fail('Invalid trip.');
  if(!UUID.test(b.id||'')||!Number.isInteger(b.version)||b.version<0)throw fail('Invalid trip.');
  if(typeof b.title!=='string'||!b.title.trim()||b.title.length>100)throw fail('Give the route a name of up to 100 characters.');
  if(typeof b.description!=='string'||b.description.length>3000)throw fail('Keep the description under 3,000 characters.');
  if(typeof b.date!=='string'||(b.date&&!/^\d{4}-\d{2}-\d{2}$/.test(b.date)))throw fail('Choose a valid date.');
  if(b.date){const date=new Date(b.date+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==b.date)throw fail('Choose a valid date.');}
  if(!Array.isArray(b.points)||b.points.length<2||b.points.length>200)throw fail('Add between 2 and 200 route points.');
  const ids=new Set();const points=b.points.map(p=>{
    if(!p||!UUID.test(p.id||'')||ids.has(p.id)||!Number.isFinite(p.lng)||!Number.isFinite(p.lat)||Math.abs(p.lng)>180||Math.abs(p.lat)>85||typeof p.label!=='string'||p.label.length>80)throw fail('A route point is invalid.');
    ids.add(p.id);return{id:p.id,lng:p.lng,lat:p.lat,label:p.label.trim()};
  });
  if(!Array.isArray(b.states)||b.states.some(s=>!STATES.has(s)))throw fail('Choose valid states.');
  return{id:b.id,title:b.title.trim(),date:b.date,description:b.description.trim(),points,states:[...new Set(b.states)].sort()};
}
function publicTrip(t,photos=[]){
  const points=JSON.parse(t.points);
  return{id:t.id,title:t.title,date:t.date,description:t.description,points,states:JSON.parse(t.states),version:t.version,photos:photos.filter(p=>p.trip===t.id).map(p=>({id:p.id,url:'/media/'+p.id,width:p.width,height:p.height,caption:p.caption,stopId:points.some(x=>x.id===p.stop)?p.stop:null}))};
}
function dimensions(data,mime){
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let width=0,height=0;
  const ascii=(start,n)=>String.fromCharCode(...data.subarray(start,start+n));
  const jpegEnd=()=>{for(let i=data.length-2;i>2;i--)if(data[i]===255&&data[i+1]===217)return true;return false};
  if(mime==='image/png'&&data.length>=45&&data[0]===137&&ascii(1,7)==='PNG\r\n\x1a\n'&&ascii(12,4)==='IHDR'&&ascii(data.length-8,4)==='IEND'){
    width=view.getUint32(16);height=view.getUint32(20);
  }else if(mime==='image/jpeg'&&data.length>20&&data[0]===255&&data[1]===216&&jpegEnd()){
    let pos=2;
    while(pos+4<data.length){
      if(data[pos]!==255)break;while(data[pos]===255)pos++;const marker=data[pos++];
      if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
      if(pos+2>data.length)break;const length=view.getUint16(pos);if(length<2||pos+length>data.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8){height=view.getUint16(pos+3);width=view.getUint16(pos+5);break}pos+=length;
    }
  }else if(mime==='image/webp'&&data.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'&&view.getUint32(4,true)+8===data.length){
    const type=ascii(12,4);
    if(type==='VP8X'){width=1+data[24]+(data[25]<<8)+(data[26]<<16);height=1+data[27]+(data[28]<<8)+(data[29]<<16)}
    else if(type==='VP8 '&&data[23]===157&&data[24]===1&&data[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383}
    else if(type==='VP8L'&&data[20]===47){const bits=view.getUint32(21,true);width=1+(bits&16383);height=1+((bits>>>14)&16383)}
  }
  if(!width||!height||width>12000||height>12000||width*height>40000000)throw fail('Use a valid JPEG, PNG, or WebP photo up to 40 megapixels.');
  return{width,height};
}
async function uploadPhoto(request,env,tripId,user){
  if(!env.FILES)throw fail('Photo storage is temporarily unavailable.',503);
  const trip=await one(env.DB,'SELECT * FROM life_trips WHERE id = ? AND owner = ?',tripId,user.id);if(!trip)throw fail('This route no longer exists.',404);
  if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data;'))throw fail('Choose a photo to upload.');
  const raw=await bytes(request,MAX_PHOTO+65536);let form;
  try{form=await new Response(raw,{headers:{'Content-Type':request.headers.get('Content-Type')}}).formData()}catch{throw fail('The upload could not be read.')}
  const file=form.get('file'),id=form.get('requestId'),caption=form.get('caption')||'',stop=form.get('stopId')||null;
  if(!file||typeof file.arrayBuffer!=='function'||file.size>MAX_PHOTO||!UUID.test(id||'')||typeof caption!=='string'||caption.length>500)throw fail('Choose a photo up to 10 MB and a short caption.');
  if(stop&&!JSON.parse(trip.points).some(p=>p.id===stop))throw fail('Choose an existing stop for this photo.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw fail('Use JPEG, PNG, or WebP.');
  const data=new Uint8Array(await file.arrayBuffer()),size=dimensions(data,file.type),hash=await digest(data);
  const existing=await one(env.DB,'SELECT * FROM life_photos WHERE id = ?',id);
  if(existing){
    if(existing.owner!==user.id||existing.trip!==tripId||existing.digest!==hash||existing.caption!==caption.trim()||existing.stop!==stop)throw fail('This upload ID belongs to another photo.',409);
    if(existing.status==='deleted')throw fail('This photo was removed. Choose it again to add a new copy.',409);
    if(existing.status==='ready')return reply({ok:true,id});
  }else{
    const usage=await one(env.DB,'SELECT COUNT(*) AS n, COALESCE(SUM(bytes),0) AS bytes FROM life_photos WHERE owner = ?',user.id);
    const count=await one(env.DB,'SELECT COUNT(*) AS n FROM life_photos WHERE trip = ?',tripId);
    if(usage.n>=500||usage.bytes+file.size>1024*1024*1024||count.n>=60)throw fail('This photo collection has reached its storage limit.',413);
    const now=Date.now();const key='life-upload:'+user.id+':'+Math.floor(now/60000);
    const rate=await one(env.DB,'INSERT INTO rate_windows (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<30 RETURNING count',key,now+120000);
    if(!rate)throw fail('Please wait a moment before uploading more photos.',429);
    const reserved=await one(env.DB,'INSERT OR IGNORE INTO life_photos (id,trip,owner,object_key,mime,bytes,width,height,caption,stop,digest,status,created) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM life_photos WHERE owner=?)<500 AND (SELECT COALESCE(SUM(bytes),0) FROM life_photos WHERE owner=?)+?<=1073741824 AND (SELECT COUNT(*) FROM life_photos WHERE trip=?)<60 RETURNING id',id,tripId,user.id,'trips/'+id,file.type,file.size,size.width,size.height,caption.trim(),stop,hash,'pending',now,user.id,user.id,file.size,tripId);
    if(!reserved){const collision=await one(env.DB,'SELECT * FROM life_photos WHERE id=?',id);if(!collision)throw fail('This photo collection has reached its storage limit.',413);if(collision.owner!==user.id||collision.trip!==tripId||collision.digest!==hash||collision.caption!==caption.trim()||collision.stop!==stop||collision.status==='deleted')throw fail('This upload ID was already used.',409);if(collision.status==='ready')return reply({ok:true,id});}
  }
  await env.FILES.put('trips/'+id,data,{httpMetadata:{contentType:file.type}});
  const stillExists=await one(env.DB,'SELECT id FROM life_trips WHERE id = ? AND owner = ?',tripId,user.id);
  if(!stillExists){await env.FILES.delete('trips/'+id);await env.DB.prepare('DELETE FROM life_photos WHERE id = ?').bind(id).run();throw fail('The route was removed during upload.',409)}
  const published=await one(env.DB,"UPDATE life_photos SET status = 'ready' WHERE id = ? AND status = 'pending' RETURNING id",id);
  if(!published){const current=await one(env.DB,'SELECT status FROM life_photos WHERE id=?',id);if(current?.status!=='ready'){await env.FILES.delete('trips/'+id);throw fail('The photo was removed during upload.',409)}}
  return reply({ok:true,id},201);
}
async function cleanRemovedPhotos(env){
  if(!env.FILES)return;
  const removed=await rows(env.DB,"SELECT p.id,p.object_key FROM life_photos p LEFT JOIN life_trips t ON p.trip=t.id WHERE p.status='deleted' OR t.id IS NULL OR (p.status='pending' AND p.created<?) LIMIT 60",Date.now()-86400000);
  for(const photo of removed){
    try{await env.FILES.delete(photo.object_key);await env.DB.prepare('DELETE FROM life_photos WHERE id=?').bind(photo.id).run()}catch{/* Keep a tombstone so the next owner action retries storage cleanup. */}
  }
  await env.DB.prepare('DELETE FROM rate_windows WHERE expires<?').bind(Date.now()).run();
}
async function findPlaces(request,env){
  const body=await jsonBody(request),query=typeof body?.q==='string'?body.q.trim():'';
  if(query.length<2||query.length>160)throw fail('Enter a city or place name (2–160 characters).');
  const cache=globalThis.caches?.default;
  const key=new Request(SITE+'/cache/places/'+encodeURIComponent(query.toLowerCase()));
  if(cache){const hit=await cache.match(key);if(hit)return reply(await hit.json())}
  const now=Date.now();
  const slot=await one(env.DB,"INSERT INTO rate_windows (key,count,expires) VALUES ('life-place-search',1,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE expires<=? RETURNING count",now+1100,now);
  if(!slot)throw fail('Wait a moment before searching again.',429);
  try{
    const url=new URL('https://photon.komoot.io/api/');url.search=new URLSearchParams({q:query,countrycode:'US',limit:'5',lang:'en'}).toString();
    const response=await fetch(url,{headers:{'User-Agent':'ThinkingLine/1.0 (https://thinking-line.wangmingshuo03.chatgpt.site)','Accept':'application/json'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('Search failed');
    const data=await response.json();
    const places=(Array.isArray(data.features)?data.features:[]).filter(f=>f.geometry?.type==='Point'&&f.properties?.countrycode==='US'&&Number.isFinite(f.geometry.coordinates?.[0])&&Number.isFinite(f.geometry.coordinates?.[1])).slice(0,5).map(f=>{
      const p=f.properties,parts=[p.name,[p.housenumber,p.street].filter(Boolean).join(' '),p.city,p.state].filter(x=>typeof x==='string'&&x.trim());
      const label=[...new Set(parts)].join(', ').slice(0,240);
      return{label:label||'Map location',lng:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]};
    }).filter(p=>Math.abs(p.lng)<=180&&Math.abs(p.lat)<=85);
    const result={places};if(cache)try{await cache.put(key,Response.json(result,{headers:{'Cache-Control':'public, max-age=3600'}}))}catch{}
    return reply(result);
  }catch{throw fail('Place search is temporarily unavailable. You can still add stops on the map.',503)}
}
export async function lifeApi(request,env,repositoryTrips=[]){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  try{
    if(path==='/api/life/session'&&method==='GET'){
      const user=identity(request);
      return reply({signedIn:!!user,canEdit:permitted(user,env),ownerConfigured:configured(env),userId:user?.id||null,email:user?.email||null});
    }
    if(path==='/api/life/trips'&&method==='GET'&&!env.DB&&repositoryTrips.length)return reply({trips:repositoryTrips});
    if(!env.DB)throw fail('Travel records are temporarily unavailable.',503);
    if(path.startsWith('/media/')&&(method==='GET'||method==='HEAD')){
      const id=path.slice(7);if(!UUID.test(id)||!env.FILES)return new Response('Photo not found',{status:404});
      const p=await one(env.DB,"SELECT p.* FROM life_photos p JOIN life_trips t ON t.id=p.trip WHERE p.id=? AND p.status='ready'",id);
      if(!p)return new Response('Photo not found',{status:404});const object=await env.FILES.get(p.object_key);if(!object)return new Response('Photo not found',{status:404});
      return new Response(method==='HEAD'?null:object.body,{headers:{'Content-Type':p.mime,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    if(path==='/api/life/trips'&&method==='GET'){
      const [trips,photos]=await Promise.all([rows(env.DB,'SELECT * FROM life_trips ORDER BY date DESC,created DESC'),rows(env.DB,"SELECT * FROM life_photos WHERE status='ready' ORDER BY created,id")]);
      const managed=repositoryTrips.map(route=>{const stored=trips.find(t=>t.id===route.id);if(!stored)return route;const uploaded=publicTrip(stored,photos).photos.map(p=>({...p,stopId:route.points.some(s=>s.id===p.stopId)?p.stopId:null}));return{...route,photos:[...(route.photos||[]),...uploaded.filter(p=>!(route.photos||[]).some(x=>x.id===p.id))]}});
      return reply({trips:[...managed,...trips.filter(t=>!repositoryTrips.some(r=>r.id===t.id)).map(t=>publicTrip(t,photos))]});
    }
    const user=owner(request,env);
    await cleanRemovedPhotos(env);
    if(path==='/api/life/places'&&method==='POST')return await findPlaces(request,env);
    if(path==='/api/life/trips'&&method==='POST'){
      const b=await jsonBody(request),trip=cleanTrip(b),hash=await digest(new TextEncoder().encode(JSON.stringify(trip)));
      const old=await one(env.DB,'SELECT * FROM life_trips WHERE id = ?',trip.id);
      if(old&&old.owner!==user.id)throw fail('This trip belongs to another owner.',403);
      if(old?.content_hash===hash)return reply({trip:publicTrip(old)});
      const now=Date.now();
      if(old){
        const changed=await one(env.DB,'UPDATE life_trips SET title=?,date=?,description=?,points=?,states=?,content_hash=?,version=version+1,updated=? WHERE id=? AND owner=? AND version=? RETURNING *',trip.title,trip.date,trip.description,JSON.stringify(trip.points),JSON.stringify(trip.states),hash,now,trip.id,user.id,b.version);
        if(!changed)throw fail('This route changed in another window. Reload it before saving.',409);
        return reply({trip:publicTrip(changed)});
      }
      if(b.version!==0)throw fail('This route no longer exists.',409);
      const total=await one(env.DB,'SELECT COUNT(*) AS n FROM life_trips WHERE owner=?',user.id);if(total.n>=300)throw fail('The route collection is full.',413);
      await env.DB.prepare('INSERT OR IGNORE INTO life_trips (id,owner,title,date,description,points,states,content_hash,version,created,updated) SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM life_trips WHERE owner=?)<300').bind(trip.id,user.id,trip.title,trip.date,trip.description,JSON.stringify(trip.points),JSON.stringify(trip.states),hash,now,now,user.id).run();
      const saved=await one(env.DB,'SELECT * FROM life_trips WHERE id=?',trip.id);
      if(!saved)throw fail('The route collection is full.',413);
      if(saved.owner!==user.id||saved.content_hash!==hash)throw fail('This trip ID was already used. Start a new route.',409);
      return reply({trip:publicTrip(saved)},201);
    }
    const match=path.match(/^\/api\/life\/trips\/([a-f0-9-]+)(?:\/(photos))?$/i);
    if(match&&UUID.test(match[1])){
      if(match[2]==='photos'&&method==='POST')return await uploadPhoto(request,env,match[1],user);
      if(!match[2]&&method==='DELETE'){
        const b=await jsonBody(request);if(!Number.isInteger(b?.version))throw fail('Invalid route version.');
        const current=await one(env.DB,'SELECT id,owner FROM life_trips WHERE id=?',match[1]);
        if(!current)return reply({ok:true});
        if(current.owner!==user.id)throw fail('This trip belongs to another owner.',403);
        const trip=await one(env.DB,'DELETE FROM life_trips WHERE id=? AND owner=? AND version=? RETURNING id',match[1],user.id,b.version);
        if(!trip)throw fail('The route changed or was already removed. Reload the list.',409);
        await cleanRemovedPhotos(env);return reply({ok:true});
      }
    }
    const photo=path.match(/^\/api\/life\/photos\/([a-f0-9-]+)$/i);
    if(photo&&UUID.test(photo[1])&&method==='DELETE'){
      const item=await one(env.DB,'SELECT object_key FROM life_photos WHERE id=? AND owner=?',photo[1],user.id);
      if(!item)return reply({ok:true});
      await env.DB.prepare("UPDATE life_photos SET status='deleted' WHERE id=? AND owner=?").bind(photo[1],user.id).run();
      await cleanRemovedPhotos(env);return reply({ok:true});
    }
    return reply({error:'Method not allowed.'},405);
  }catch(error){return reply({error:error.status?error.message:'The trip could not be saved. Your changes are still on this page.'},error.status||503)}
}
