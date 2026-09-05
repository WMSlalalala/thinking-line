/* Shared anonymous interactions. Browser storage holds only random IDs and preferences. */
var API='https://thinking-line.wangmingshuo03.chatgpt.site';
var sharedStats={},sharedComments={},sharedMine={},sharedReady=false,touchedStats={};
var visitor=g('tl_visitor');if(!visitor){visitor=crypto.randomUUID();s('tl_visitor',visitor)}
var visit;try{visit=sessionStorage.getItem('tl_visit')}catch(e){}
if(!visit){visit=crypto.randomUUID();try{sessionStorage.setItem('tl_visit',visit)}catch(e){}}
async function requestAPI(path,method,data){
  var response=await fetch(API+path,{method:method||'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  var payload;try{payload=await response.json()}catch(e){throw new Error('Comments are temporarily unavailable. Please try again later.')}
  if(!response.ok)throw new Error(payload.error||'Unable to save. Please try again.');return payload;
}
function syncCounts(){
  document.querySelectorAll('[data-views]').forEach(function(el){var st=sharedStats[el.dataset.views];el.textContent=st?fmt(st.views):'—'});
  document.querySelectorAll('[data-hooks]').forEach(function(el){var st=sharedStats[el.dataset.hooks];el.textContent=st?fmt(st.hooks):'—'});
}
async function loadSummary(){try{var data=await requestAPI('/api/summary');Object.keys(data.stats).forEach(function(id){if(!touchedStats[id])sharedStats[id]=data.stats[id]});sharedReady=true;document.getElementById('visits').textContent=fmt(data.visits);syncCounts()}catch(e){document.getElementById('visits').textContent='—'}}
async function visitSite(){try{var data=await requestAPI('/api/visit','POST',{visit:visit});document.getElementById('visits').textContent=fmt(data.visits)}catch(e){}}
function renderSharedPost(id,data,generation){
  if(generation!==routeVersion)return;
  touchedStats[id]=true;sharedStats[id]={views:data.views,hooks:data.hooks,comments:data.commentCount};sharedComments[id]=data.comments;sharedMine[id]=data.hooked;
  if(generation!==routeVersion||location.hash.split('/')[2]!==id)return;
  syncCounts();var hb=document.getElementById('hook');
  if(hb){hb.disabled=false;hb.classList.toggle('on',data.hooked);hb.setAttribute('aria-pressed',String(data.hooked));document.getElementById('hooklbl').textContent=(data.hooked?'Hooked':'Hook this')+' · '+data.hooks}
  var list=document.getElementById('clist');if(list)list.innerHTML=data.comments.length?data.comments.map(cHTML).join(''):'<p class="empty">No comments yet. Start the conversation.</p>';
  var count=document.getElementById('ccount');if(count)count.textContent=data.commentCount;
}
async function loadSharedPost(id,recordView,generation){
  try{if(recordView)await requestAPI('/api/view/'+encodeURIComponent(id),'POST',{visit:visit});var data=await requestAPI('/api/post/'+encodeURIComponent(id)+'?visitor='+encodeURIComponent(visitor));renderSharedPost(id,data,generation)}
  catch(e){if(generation!==routeVersion||location.hash.split('/')[2]!==id)return;var status=document.getElementById('comment-status');if(status)status.textContent=e.message;var list=document.getElementById('clist');if(list)list.innerHTML='<p class="empty">Comments are temporarily unavailable.</p>'}
}
function wireShared(id,generation){
  var hb=document.getElementById('hook'),form=document.getElementById('cform');
  if(hb){hb.disabled=true;hb.addEventListener('click',async function(){hb.disabled=true;try{var data=await requestAPI('/api/hook/'+encodeURIComponent(id),'PUT',{visitor:visitor,hooked:!sharedMine[id]});sharedMine[id]=data.hooked;sharedStats[id].hooks=data.hooks;if(generation!==routeVersion||location.hash.split('/')[2]!==id)return;hb.classList.toggle('on',data.hooked);hb.setAttribute('aria-pressed',String(data.hooked));document.getElementById('hooklbl').textContent=(data.hooked?'Hooked':'Hook this')+' · '+data.hooks;syncCounts()}catch(e){var message=document.getElementById('comment-status');if(message&&generation===routeVersion&&location.hash.split('/')[2]===id)message.textContent=e.message}finally{hb.disabled=false}})}
  if(form){var requestId=null,lastPayload=null;form.addEventListener('submit',async function(e){
    e.preventDefault();var body=document.getElementById('cbody'),name=document.getElementById('cname'),status=document.getElementById('comment-status'),submit=form.querySelector('button[type=submit]');
    if(!body.value.trim())return;var sentBody=body.value,sentName=name.value,snapshot=JSON.stringify([sentName.trim(),sentBody.trim()]);submit.disabled=true;status.textContent='Posting…';if(snapshot!==lastPayload){requestId=crypto.randomUUID();lastPayload=snapshot}else requestId=requestId||crypto.randomUUID();
    try{await requestAPI('/api/comment/'+encodeURIComponent(id),'POST',{visitor:visitor,requestId:requestId,name:sentName.trim(),body:sentBody.trim(),website:document.getElementById('website').value});if(body.value===sentBody)body.value='';requestId=null;lastPayload=null;status.textContent='Comment posted.';await loadSharedPost(id,false,generation)}catch(error){status.textContent=error.message}finally{submit.disabled=false}
  })}
  loadSharedPost(id,true,generation);
}
