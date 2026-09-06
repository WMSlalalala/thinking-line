var FISHING=__FISHING_JSON__;
var LIFE={map:null,popup:null,markers:[],trips:[],states:null,selected:null,resizeHandler:null,libPromise:null,section:'road-trips',lines:[]};
function photoDialog(){return '<dialog class="photo-viewer" id="photo-viewer"><button type="button" aria-label="Close photo">×</button><img alt=""></dialog>'}
function life(){LIFE.section='road-trips';return '<div class="life-heading"><h1 class="title">Life</h1></div><div id="life-content"><p class="empty">Loading the travel map…</p></div><section class="fishing-section"><h2 class="h">Fishing</h2><div class="fishing-wall" id="fishing-wall"></div></section>'+photoDialog()}
function disposeLife(){LIFE.mapObserver?.disconnect();LIFE.mapObserver=null;clearTimeout(LIFE.roadTimer);LIFE.roadRequest=(LIFE.roadRequest||0)+1;LIFE.roadOverlay=null;LIFE.roadPending?.remove();LIFE.roadPending=null;LIFE.atlasLabels=null;LIFE.atlasRoads=null;if(LIFE.map){LIFE.map.remove();LIFE.map=null}if(LIFE.popup){LIFE.popup.remove();LIFE.popup=null}LIFE.markers=[];LIFE.lines=[];LIFE.stateLayer=null;LIFE.routeLayer=null;if(LIFE.resizeHandler){window.removeEventListener('resize',LIFE.resizeHandler);LIFE.resizeHandler=null}}
function lifeStatus(message){var status=document.getElementById('life-status');if(status)status.textContent=message||''}
function mediaURL(photo){return photo.src||API+photo.url}
function showPhoto(src,alt){var dialog=document.getElementById('photo-viewer');if(!dialog)return;var img=dialog.querySelector('img');img.src=src;img.alt=alt||'';if(dialog.showModal&&!dialog.open)dialog.showModal()}
function wirePhotoDialog(){var dialog=document.getElementById('photo-viewer');if(!dialog)return;dialog.querySelector('button').onclick=function(){dialog.close()};dialog.addEventListener('click',function(e){if(e.target===dialog)dialog.close()})}
function fishingColumns(width){return width<=360?1:width<=640?2:width<=1000?3:4}
function renderFishing(){var wall=document.getElementById('fishing-wall');if(!wall)return;var count=fishingColumns(window.innerWidth),columns=Array.from({length:count},function(){return{height:0,photos:[]}});FISHING.forEach(function(p){var col=columns.reduce(function(a,b){return a.height<=b.height?a:b});col.photos.push(p);col.height+=p.height/p.width+.07});wall.innerHTML=columns.map(function(col){return '<div class="photo-column">'+col.photos.map(function(p){return '<button class="fishing-photo" type="button" data-fishing="'+p.id+'" aria-label="Enlarge photo: '+esc(p.alt)+'"><img src="'+esc(p.src)+'" alt="'+esc(p.alt)+'" width="'+p.width+'" height="'+p.height+'" loading="lazy" decoding="async"></button>'}).join('')+'</div>'}).join('')}
async function lifeRequest(path){var response=await fetch(API+path,{credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('The travel service is unavailable.');return response.json()}
function mapMarkup(){return '<div class="travel-map-wrap"><div id="travel-map" class="travel-map" aria-label="Interactive map of United States road trips"></div><div class="map-cameras"><button type="button" data-camera="usa">US overview</button></div></div>'}
function routeColor(trip){return /^#[0-9a-f]{6}$/i.test(trip.color||'')?trip.color:['#3679bd','#8861b0','#218f8b'][Math.max(0,LIFE.trips.indexOf(trip))%3]}
function tripStops(trip){return trip.loop===false?trip.points:trip.points.slice(0,-1)}
function tripCoordinates(trip){return trip.geometry?.type==='LineString'?trip.geometry.coordinates:trip.points.map(function(p){return[p.lng,p.lat]})}
function renderTrips(){var area=document.getElementById('life-content');area.innerHTML='<div class="life-toolbar"><h2 class="h">Road trips</h2></div>'+mapMarkup()+'<p class="map-status" id="life-status" role="status"></p><section class="trip-detail" id="trip-detail"></section>';area.onclick=handleLifeClick}
function renderTripDetail(trip){
  document.getElementById('trip-detail').innerHTML='<ol class="route-stops" aria-label="Route stops">'+trip.points.map(function(p){return '<li>'+esc(p.label)+'</li>'}).join('')+'</ol>'+(trip.description?'<p>'+esc(trip.description)+'</p>':'')+'<div class="trip-gallery">'+(trip.photos||[]).map(function(p){return '<button type="button" data-trip-photo="'+esc(p.id)+'" aria-label="Enlarge '+esc(p.caption||trip.title)+'"><img src="'+esc(mediaURL(p))+'" alt="'+esc(p.caption||trip.title)+'" loading="lazy"></button>'}).join('')+'</div>';
}
function selectTrip(id){
  var trip=LIFE.trips.find(function(t){return t.id===id});if(!trip)return;LIFE.selected=id;
  renderTripDetail(trip);
  if(LIFE.map){LIFE.overview=false;LIFE.map.fitBounds(tripCoordinates(trip).map(function(p){return[p[1],p[0]]}),{padding:[40,40],maxZoom:9,animate:true})}updateMapData();
}
function handleLifeClick(e){
  var card=e.target.closest('[data-open-trip]');if(card){selectTrip(card.getAttribute('data-open-trip'));return}
  var photo=e.target.closest('[data-trip-photo]');if(photo){var found;LIFE.trips.some(function(t){found=t.photos.find(function(p){return p.id===photo.getAttribute('data-trip-photo')});return !!found});if(found)showPhoto(mediaURL(found),found.caption);return}
  if(e.target.closest('[data-camera]')){LIFE.selected=null;document.getElementById('trip-detail').innerHTML='';moveCamera('usa');updateMapData()}
}
function ringContains(point,ring){var inside=false;for(var i=0,j=ring.length-1;i<ring.length;j=i++){var a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
function stateAt(lng,lat){if(!LIFE.states)return null;var point=[lng,lat],found=LIFE.states.features.find(function(f){var polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;return polygons.some(function(poly){return ringContains(point,poly[0])&&!poly.slice(1).some(function(hole){return ringContains(point,hole)})})});return found?.properties.postal||null}
function visitedStates(){return [...new Set(LIFE.trips.flatMap(function(t){return t.states}))]}
async function wireLife(generation){
  wirePhotoDialog();renderFishing();document.getElementById('fishing-wall').onclick=function(e){var b=e.target.closest('[data-fishing]');if(b){var p=FISHING.find(function(p){return p.id===b.getAttribute('data-fishing')});if(p)showPhoto(p.src,p.alt)}};
  var columns=fishingColumns(window.innerWidth);LIFE.resizeHandler=function(){var next=fishingColumns(window.innerWidth);if(next!==columns){columns=next;renderFishing()}};window.addEventListener('resize',LIFE.resizeHandler);
  try{
    var results=await Promise.all([fetch('assets/map/trips.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error('The routes could not load.');return r.json()}),LIFE.states?Promise.resolve(LIFE.states):fetch('assets/map/us-states.geojson').then(function(r){if(!r.ok)throw new Error('The map could not load.');return r.json()})]);
    if(generation!==routeVersion)return;LIFE.trips=results[0];LIFE.states=results[1];renderTrips();await createTravelMap(generation);
    // Repository data drives the map on either host. Merge existing uploaded photos without replacing newer source-managed routes.
    lifeRequest('/api/life/trips').then(function(data){if(generation!==routeVersion)return;var extra=data.trips.filter(function(t){return !t.managed&&!LIFE.trips.some(function(x){return x.id===t.id})});LIFE.trips=LIFE.trips.map(function(t){var stored=data.trips.find(function(x){return x.id===t.id});return stored?.photos?.length?{...t,photos:stored.photos}:t}).concat(extra);var selected=LIFE.trips.find(function(t){return t.id===LIFE.selected});if(selected)renderTripDetail(selected);updateMapData()}).catch(function(){});
  }catch(error){if(generation!==routeVersion)return;var area=document.getElementById('life-content');if(document.getElementById('life-status'))lifeStatus(error.message);else area.innerHTML='<p class="empty">'+esc(error.message)+'</p>'}
}
