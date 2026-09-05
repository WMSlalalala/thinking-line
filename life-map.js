function loadMapLibrary(){
  if(LIFE.libPromise)return LIFE.libPromise;
  var css=new Promise(function(resolve,reject){
    var link=document.getElementById('leaflet-css');if(link?.sheet){resolve();return}
    if(!link){link=document.createElement('link');link.id='leaflet-css';link.rel='stylesheet';link.href='assets/vendor/leaflet.css'}
    link.onload=resolve;link.onerror=function(){link.remove();reject(new Error('The map style could not load. Please refresh.'))};if(!link.parentNode)document.head.appendChild(link);
  });
  var js=window.L?Promise.resolve():new Promise(function(resolve,reject){var script=document.createElement('script');script.src='assets/vendor/leaflet.js';script.onload=resolve;script.onerror=function(){script.remove();reject(new Error('The map could not load. Please refresh.'))};document.head.appendChild(script)});
  LIFE.libPromise=Promise.all([css,js]).catch(function(error){LIFE.libPromise=null;throw error});return LIFE.libPromise;
}
function moveCamera(which){
  if(!LIFE.map)return;
  if(which==='route'){fitPoints(LIFE.edit?.points||[]);return}
  var bounds=which==='alaska'?[[51,-170],[71,-130]]:which==='hawaii'?[[18.7,-160.6],[22.5,-154.5]]:[[24.4,-124.9],[49.5,-66.8]];
  LIFE.overview=which==='usa';LIFE.cameraBounds=bounds;setMapOverviewLimit();
  LIFE.map.fitBounds(bounds,{padding:[12,12],animate:false});
}
function setMapOverviewLimit(){
  if(!LIFE.map||!LIFE.cameraBounds)return;
  LIFE.map.setMinZoom(0);
  LIFE.map.setMinZoom(LIFE.map.getBoundsZoom(LIFE.cameraBounds,false,[24,24]));
}
function fitPoints(points){if(LIFE.map&&points.length){LIFE.overview=false;LIFE.map.fitBounds(points.map(function(p){return[p.lat,p.lng]}),{padding:[24,24],maxZoom:12,animate:true})}}
function stateStyle(feature){var visited=visitedStates().includes(feature.properties.postal);return{pane:'atlasLand',color:visited?'#518768':'#a5b4a6',weight:visited?1.4:.7,opacity:.9,fillColor:visited?'#a7d4ac':'#e6efda',fillOpacity:1}}
function setRouteEmphasis(id){
  LIFE.lines.forEach(function(item){var active=!id||item.id===id;item.line.setStyle({weight:item.id===id?5:3.5,opacity:active?.95:.23});item.halo.setStyle({weight:item.id===id?9:7,opacity:active?.85:.2})});
}
function updateMapData(){
  if(!LIFE.map||!LIFE.routeLayer)return;clearPopup();LIFE.stateLayer?.setStyle(stateStyle);LIFE.routeLayer.clearLayers();LIFE.lines=[];
  LIFE.trips.forEach(function(trip){var points=tripCoordinates(trip).map(function(p){return[p[1],p[0]]});if(points.length<2)return;
    var halo=L.polyline(points,{color:'#ffffff',weight:7,opacity:.85,interactive:false,lineCap:'round',lineJoin:'round'}).addTo(LIFE.routeLayer);
    var line=L.polyline(points,{color:routeColor(trip),weight:3.5,opacity:.95,lineCap:'round',lineJoin:'round',bubblingMouseEvents:false}).addTo(LIFE.routeLayer);
    LIFE.lines.push({id:trip.id,halo:halo,line:line});line.on('mouseover',function(e){setRouteEmphasis(trip.id);popupAt([e.latlng.lng,e.latlng.lat],trip.title,trip.points.slice(0,-1).map(function(p){return p.name||p.label}).join(' → '),trip.photos?.[0])});line.on('mouseout',function(){clearPopup();setRouteEmphasis(LIFE.selected)});line.on('click',function(){selectTrip(trip.id)});
  });setRouteEmphasis(LIFE.selected);renderMapMarkers();
}
function popupAt(lngLat,title,detail,photo){
  if(!LIFE.map)return;clearPopup();var el=document.createElement('div');
  el.innerHTML=(photo?'<img src="'+esc(mediaURL(photo))+'" alt="'+esc(photo.caption||title)+'">':'')+'<div class="popup-copy"><strong>'+esc(title)+'</strong><span>'+esc(detail||'')+'</span></div>';
  LIFE.popup=L.popup({closeButton:false,autoPan:false,offset:[0,-8],className:'trip-popup',maxWidth:240}).setLatLng([lngLat[1],lngLat[0]]).setContent(el).openOn(LIFE.map);
}
function clearPopup(){if(LIFE.popup){LIFE.popup.remove();LIFE.popup=null}}
function renderMapMarkers(){
  LIFE.markers.forEach(function(m){m.remove()});LIFE.markers=[];
  var trips=LIFE.selected?LIFE.trips.filter(function(t){return t.id===LIFE.selected}):LIFE.trips;
  trips.forEach(function(t){t.points.forEach(function(p,i){var first=t.points[0];if(i===t.points.length-1&&Math.abs(p.lng-first.lng)<.001&&Math.abs(p.lat-first.lat)<.001)return;
    var photo=t.photos?.find(function(x){return x.stopId===p.id})||(!i?t.photos?.[0]:null);
    var marker=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'travel-pin-wrap',html:'<span class="route-stop-pin" style="--trip-color:'+routeColor(t)+'">'+(LIFE.selected?i+1:'')+'</span>',iconSize:[22,22],iconAnchor:[11,11]}),keyboard:true,title:p.label,alt:p.label,draggable:false,bubblingMouseEvents:false}).addTo(LIFE.map);
    marker.on('click',function(){selectTrip(t.id)});marker.on('mouseover',function(){setRouteEmphasis(t.id);popupAt([p.lng,p.lat],p.label,t.title,photo)});marker.on('mouseout',function(){clearPopup();setRouteEmphasis(LIFE.selected)});LIFE.markers.push(marker);
  })});
}
function atlasRoadStyle(feature){var zoom=LIFE.map?.getZoom()||4;return{pane:'atlasRoads',interactive:false,color:'#ffffff',weight:feature.properties.TYPE===1?1.6:.8,opacity:zoom>=6?.65:0}}
function atlasRoadExportURL(map){
  var bounds=map.getBounds(),sw=L.CRS.EPSG3857.project(bounds.getSouthWest()),ne=L.CRS.EPSG3857.project(bounds.getNorthEast()),size=map.getSize(),scale=Math.min(1,1600/Math.max(size.x,size.y));
  var url=new URL('https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/export');
  var layers=map.getZoom()>=10?'16,17,18,19,20,21,29,30,31,32':'3,9';
  var params={bbox:[sw.x,sw.y,ne.x,ne.y].join(','),bboxSR:'3857',imageSR:'3857',size:Math.round(size.x*scale)+','+Math.round(size.y*scale),dpi:'96',format:'png32',transparent:'true',layers:'show:'+layers,f:'image'};
  Object.keys(params).forEach(function(key){url.searchParams.set(key,params[key])});return url.href;
}
function refreshAtlasRoads(){
  var map=LIFE.map;if(!map)return;clearTimeout(LIFE.roadTimer);var request=LIFE.roadRequest=(LIFE.roadRequest||0)+1;
  LIFE.roadPending?.remove();LIFE.roadPending=null;
  if(map.getZoom()<7){LIFE.roadOverlay?.remove();LIFE.roadOverlay=null;return}
  LIFE.roadTimer=setTimeout(function(){
    if(LIFE.map!==map||LIFE.roadRequest!==request)return;
    var layer=L.imageOverlay(atlasRoadExportURL(map),map.getBounds(),{pane:'atlasRoads',className:'atlas-road-detail',interactive:false,opacity:0});LIFE.roadPending=layer;
    layer.on('load',function(){if(LIFE.map!==map||LIFE.roadRequest!==request){layer.remove();return}LIFE.roadOverlay?.remove();LIFE.roadOverlay=layer;LIFE.roadPending=null;layer.setOpacity(.55)});
    layer.on('error',function(){layer.remove();if(LIFE.roadRequest===request){LIFE.roadPending=null;LIFE.atlasRoads?.setStyle(function(f){return{...atlasRoadStyle(f),opacity:.75}})}});
    layer.addTo(map);
  },300);
}
function drawAtlasLabels(){
  var map=LIFE.map;if(!map||!LIFE.atlasLabels)return;LIFE.atlasLabels.clearLayers();var zoom=map.getZoom(),occupied=[];
  // Labels are placed from source coordinates and culled in screen space.
  function addLabel(lng,lat,text,kind,feature){
    var ll=[lat,lng];if(!map.getBounds().contains(ll))return;var pos=map.latLngToContainerPoint(ll),width=text.length*(kind==='city'?6.5:7.5)+12,box=[pos.x-4,pos.y-9,pos.x+width,pos.y+11];
    if(occupied.some(function(b){return box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]}))return;
    occupied.push(box);var marker=L.marker(ll,{pane:'atlasLabels',interactive:false,keyboard:false,title:text,bubblingMouseEvents:false,icon:L.divIcon({className:'atlas-label '+kind+'-label',html:(kind==='city'?'<i></i>':'')+'<span>'+esc(text)+'</span>',iconSize:[width,20],iconAnchor:[4,10]})}).addTo(LIFE.atlasLabels);
  }
  LIFE.cities.features.slice().sort(function(a,b){return b.properties.POP_MAX-a.properties.POP_MAX}).forEach(function(f){if(zoom<Math.max(2.5,f.properties.MIN_ZOOM-1))return;addLabel(f.geometry.coordinates[0],f.geometry.coordinates[1],f.properties.NAME,'city',f)});
  if(zoom<7)LIFE.states.features.forEach(function(f){addLabel(f.properties.longitude,f.properties.latitude,f.properties.postal,'state')});
}
async function createTravelMap(generation){
  await loadMapLibrary();
  if(!LIFE.roads||!LIFE.cities){var atlas=await Promise.all(['us-roads','us-cities'].map(function(name){return fetch('assets/map/'+name+'.geojson').then(function(r){if(!r.ok)throw new Error('The road atlas could not load. Please refresh.');return r.json()})}));LIFE.roads=atlas[0];LIFE.cities=atlas[1]}
  if(generation!==routeVersion||!document.getElementById('travel-map'))return;
  LIFE.map=L.map('travel-map',{zoomControl:false,minZoom:2,maxZoom:16,zoomSnap:.05,zoomDelta:.5,preferCanvas:true,scrollWheelZoom:true,doubleClickZoom:true});
  ['atlasLand','atlasRoads','atlasLabels'].forEach(function(name,i){var pane=LIFE.map.createPane(name);pane.style.zIndex=String(name==='atlasLabels'?450:300+i*30);if(name==='atlasRoads')pane.style.pointerEvents='none'});
  L.control.zoom({position:'topright'}).addTo(LIFE.map);
  LIFE.map.attributionControl.setPrefix(false);LIFE.map.attributionControl.addAttribution('<a href="https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer" target="_blank" rel="noopener">USGS The National Map</a> · <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> · Routes: <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a> · &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors');
  LIFE.stateLayer=L.geoJSON(LIFE.states,{style:stateStyle,onEachFeature:function(feature,layer){layer.on('mouseover',function(e){if(LIFE.section==='edit')return;var trip=LIFE.trips.find(function(t){return t.states.includes(feature.properties.postal)});if(trip)popupAt([e.latlng.lng,e.latlng.lat],feature.properties.name,trip.title,trip.photos[0])});layer.on('mouseout',clearPopup);layer.on('click',function(e){if(LIFE.section==='edit')return;var trip=LIFE.trips.find(function(t){return t.states.includes(feature.properties.postal)});if(trip){L.DomEvent.stopPropagation(e);selectTrip(trip.id)}})}}).addTo(LIFE.map);
  LIFE.atlasRoads=L.geoJSON(LIFE.roads,{style:atlasRoadStyle,interactive:false,pane:'atlasRoads'}).addTo(LIFE.map);
  LIFE.atlasLabels=L.layerGroup().addTo(LIFE.map);LIFE.routeLayer=L.layerGroup().addTo(LIFE.map);moveCamera('usa');updateMapData();drawAtlasLabels();
  LIFE.map.on('dragstart',function(){LIFE.overview=false});
  LIFE.map.on('zoomend',function(){if(LIFE.map.getZoom()>LIFE.map.getMinZoom()+.1)LIFE.overview=false;LIFE.stateLayer?.setStyle(stateStyle);LIFE.atlasRoads?.setStyle(atlasRoadStyle)});
  LIFE.map.on('moveend',function(){drawAtlasLabels();refreshAtlasRoads()});
  LIFE.map.on('resize',function(){if(LIFE.overview)moveCamera('usa');else setMapOverviewLimit();drawAtlasLabels();refreshAtlasRoads()});
  if(window.ResizeObserver){var map=LIFE.map;LIFE.mapObserver=new window.ResizeObserver(function(){if(LIFE.map===map)map.invalidateSize({pan:false})});LIFE.mapObserver.observe(map.getContainer())}
  refreshAtlasRoads();
}
