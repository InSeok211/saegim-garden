const firebaseConfig={
  apiKey:"AIzaSyDR9WBSaE7GHtaSPiH1sCLjtfJ85tzVtjM",
  authDomain:"saegim-garden.firebaseapp.com",
  projectId:"saegim-garden",
  storageBucket:"saegim-garden.firebasestorage.app",
  messagingSenderId:"846018467538",
  appId:"1:846018467538:web:fb5fa0e5c9f9056e427f0b"
};
try{firebase.initializeApp(firebaseConfig)}catch(e){}
const db=firebase.firestore();
const EVENT_ID='dadaepo-beer-2026';

let places={};

const MAP_MARKERS={
  food:{icon:'truck',label:'푸드트럭'},beer:{icon:'beer',label:'맥주'},stage:{icon:'mic-2',label:'무대'},info:{icon:'info',label:'안내소'},
  toilet:{icon:'toilet',label:'화장실'},medical:{icon:'cross',label:'의료·안전'},entrance:{icon:'log-in',label:'출입구'},
  seating:{icon:'armchair',label:'테이블·관람석'},default:{icon:'map-pin',label:'장소'}
};
function markerTypeFor(id,place={}){
  if(MAP_MARKERS[place.markerType])return place.markerType;
  const text=`${id} ${place.name||''} ${place.category||''}`.toLowerCase();
  if(/맥주|beer/.test(text))return'beer';
  if(/화장실|toilet/.test(text))return'toilet';
  if(/의료|응급|안전|medical/.test(text))return'medical';
  if(/입구|출구|출입|entrance|gate/.test(text))return'entrance';
  if(/테이블|관람|스탠드|좌석|seating/.test(text))return'seating';
  if(/무대|공연|stage/.test(text))return'stage';
  if(/안내|운영본부|info/.test(text))return'info';
  if(place.category==='먹거리'||/푸드|트럭|food/.test(text))return'food';
  return'default';
}
function markerIconMarkup(id,place){
  const type=markerTypeFor(id,place);const marker=MAP_MARKERS[type]||MAP_MARKERS.default;
  return `<span class="marker-symbol"><i data-lucide="${marker.icon}"></i></span>`;
}
function refreshMarkerIcons(){if(window.lucide)window.lucide.createIcons({attrs:{'aria-hidden':'true'}})}

const safeStorage=(()=>{
  try{const k='__dadepo_test__';localStorage.setItem(k,'1');localStorage.removeItem(k);return localStorage}
  catch(e){const mem={};return{getItem:k=>Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]},clear:()=>Object.keys(mem).forEach(k=>delete mem[k])}}
})();

let schedules=[]; // 운영본부 모니터에서 실시간으로 채워짐

function goPage(id,navEl){
  document.body.classList.toggle('map-mode',id==='map');
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id));
  if(id!=='map') toggleMapList(false);
  window.scrollTo({top:0,behavior:id==='map'?'auto':'smooth'});
  if(id==='map') renderPlaces(currentFilter);
  if(id==='schedule'&&!document.querySelector('#scheduleList').children.length) renderSchedule(currentScheduleMode);
}

let currentFilter='전체';
let mapSearchQuery='';
let selectedMapPlaceId=null;
function getFilteredPlaces(){
  const q=mapSearchQuery.trim().toLowerCase();
  return Object.entries(places).filter(([id,p])=>{
    const categoryMatch=currentFilter==='전체'||p.category===currentFilter;
    const searchMatch=!q||`${p.name} ${p.category} ${p.summary} ${p.info||''}`.toLowerCase().includes(q);
    return categoryMatch&&searchMatch;
  });
}
function renderPlaces(filter=currentFilter){
  currentFilter=filter;
  const list=document.getElementById('placeList');
  if(!list)return;
  const rows=getFilteredPlaces();
  list.innerHTML=rows.length?rows.map(([id,p])=>{
    return `<button class="place-card" onclick="selectMapPlace('${id}');toggleMapList(false)"><span class="place-thumb">${escapeHtml(p.emoji||'📍')}</span><span><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.summary||'')}</p><i class="place-tag">${escapeHtml(p.category||'기타')}</i></span><span class="chev">›</span></button>`;
  }).join(''):'<div class="map-list-empty">조건에 맞는 점포나 시설이 없습니다.</div>';
  const count=document.getElementById('mapResultCount');if(count)count.textContent=rows.length;
  const subtitle=document.getElementById('mapListSubtitle');if(subtitle)subtitle.textContent=`${currentFilter}${mapSearchQuery?' 검색':''} · ${rows.length}곳`;
  const status=document.getElementById('mapStatusText');if(status)status.textContent=mapSearchQuery?`“${mapSearchQuery}” 검색 결과 ${rows.length}곳`:`${currentFilter} ${rows.length}곳 보기`;
  updateMapPins(rows.map(r=>r[0]));
}
function renderMapPins(){
  const container=document.getElementById('mapPins');if(!container)return;
  container.innerHTML=Object.entries(places)
    .sort(([,a],[,b])=>Number(a.order||0)-Number(b.order||0))
    .map(([id,p])=>`<button class="pin marker-${markerTypeFor(id,p)}" data-id="${id}" style="left:${Math.max(3,Math.min(94,Number(p.x)||50))}%;top:${Math.max(8,Math.min(90,Number(p.y)||50))}%" onclick="selectMapPlace('${id}',this)" aria-label="${escapeHtml(p.name)}">${markerIconMarkup(id,p)}</button>`)
    .join('');
  refreshMarkerIcons();
}
function subscribePlaces(){
  try{
    db.collection('events').doc(EVENT_ID).collection('places').onSnapshot(snap=>{
      places=Object.fromEntries(snap.docs
        .map(doc=>[doc.id,{...doc.data()}])
        .filter(([,place])=>place.active!==false));
      if(selectedMapPlaceId&&!places[selectedMapPlaceId])clearMapSelection();
      renderMapPins();
      renderPlaces(currentFilter);
    },err=>console.warn('place listen failed',err));
  }catch(e){console.warn('place subscribe failed',e)}
}
function setFilter(filter,el){
  currentFilter=filter;
  document.querySelectorAll('#filters .filter').forEach(b=>b.classList.toggle('active',b.textContent.trim()===filter));
  renderPlaces(filter);
}
function searchMapPlaces(value){
  mapSearchQuery=String(value||'');
  document.getElementById('mapSearchClear')?.classList.toggle('show',!!mapSearchQuery);
  renderPlaces(currentFilter);
}
function clearMapSearch(){
  mapSearchQuery='';
  const input=document.getElementById('mapSearchInput');if(input){input.value='';input.focus()}
  document.getElementById('mapSearchClear')?.classList.remove('show');
  renderPlaces(currentFilter);
}
function updateMapPins(visibleIds){
  const allowed=new Set(visibleIds);
  document.querySelectorAll('#festivalMap .pin').forEach(pin=>pin.classList.toggle('is-muted',!allowed.has(pin.dataset.id)));
  if(selectedMapPlaceId&&!allowed.has(selectedMapPlaceId))clearMapSelection();
}
let mapListMotionToken=0;
let mapListHideTimer=0;
function toggleMapList(open){
  const panel=document.getElementById('mapListPanel');
  const backdrop=document.getElementById('mapListBackdrop');
  const trigger=document.getElementById('mapListTrigger');
  if(!panel||!backdrop)return;
  const token=++mapListMotionToken;
  window.clearTimeout(mapListHideTimer);

  if(open){
    renderPlaces(currentFilter);
    panel.hidden=false;
    panel.classList.remove('open','closing');
    panel.classList.add('opening');
    panel.setAttribute('aria-hidden','false');
    trigger?.setAttribute('aria-expanded','true');
    backdrop.classList.add('open');

    // 숨김을 먼저 해제한 뒤 두 프레임을 기다려 아래에서 올라오는 모션을 만듭니다.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(token!==mapListMotionToken)return;
      panel.classList.add('open');
      panel.classList.remove('opening');
      panel.querySelector('.map-list-close')?.focus({preventScroll:true});
    }));
  }else{
    trigger?.setAttribute('aria-expanded','false');
    backdrop.classList.remove('open');
    panel.setAttribute('aria-hidden','true');

    if(panel.hidden){
      panel.classList.remove('open','opening','closing');
      return;
    }

    panel.classList.remove('open','opening');
    panel.classList.add('closing');

    // 내려가는 모션이 끝난 다음 display:none과 같은 hidden 상태로 전환합니다.
    mapListHideTimer=window.setTimeout(()=>{
      if(token!==mapListMotionToken||panel.classList.contains('open'))return;
      panel.hidden=true;
      panel.classList.remove('closing');
    },380);
  }
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.getElementById('mapListPanel')?.classList.contains('open')){
    toggleMapList(false);
    document.getElementById('mapListTrigger')?.focus({preventScroll:true});
  }
});
function selectMapPlace(id,pinEl){
  const p=places[id];if(!p)return;
  selectedMapPlaceId=id;
  document.querySelectorAll('#festivalMap .pin').forEach(x=>x.classList.toggle('active',x.dataset.id===id));
  const pin=pinEl||document.querySelector(`#festivalMap .pin[data-id="${id}"]`);if(pin)pin.classList.add('active');
  const preview=document.getElementById('mapPlacePreview');
  preview.innerHTML=`<span class="map-preview-icon">${p.emoji}</span><span class="map-preview-copy"><strong>${p.name}</strong><span>${p.category} · ${p.hours}</span></span><span class="map-preview-actions"><button onclick="showSelectedPlaceDetails()" aria-label="상세 정보"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/></svg></button><button class="primary" onclick="showToast('길찾기는 실제 지도 연결 단계에서 적용됩니다.')" aria-label="길찾기"><svg viewBox="0 0 24 24"><path d="M5 19 19 5M8 5h11v11"/></svg></button></span>`;
  preview.hidden=false;
  const status=document.getElementById('mapStatusText');if(status)status.textContent=`${p.name} 선택됨`;
}
function showSelectedPlaceDetails(){if(selectedMapPlaceId)openPlace(selectedMapPlaceId)}
function clearMapSelection(){
  selectedMapPlaceId=null;
  document.querySelectorAll('#festivalMap .pin').forEach(x=>x.classList.remove('active'));
  const preview=document.getElementById('mapPlacePreview');if(preview)preview.hidden=true;
}
const MAP_MIN_SCALE=1;
const MAP_MAX_SCALE=3;
const mapView={scale:1,x:0,y:0};
const mapPointers=new Map();
let mapGesture=null;
let mapGestureMoved=false;
let suppressMapClick=false;
function clampMapView(){
  const wrap=document.querySelector('.map-page-shell .map-wrap');if(!wrap)return;
  const width=wrap.clientWidth;const height=wrap.clientHeight;
  mapView.x=Math.min(0,Math.max(width*(1-mapView.scale),mapView.x));
  mapView.y=Math.min(0,Math.max(height*(1-mapView.scale),mapView.y));
}
function applyMapView(){
  const map=document.getElementById('festivalMap');if(!map)return;
  clampMapView();
  map.style.transform=`translate(${mapView.x}px,${mapView.y}px) scale(${mapView.scale})`;
  const zoomIn=document.getElementById('mapZoomIn');if(zoomIn)zoomIn.disabled=mapView.scale>=MAP_MAX_SCALE-.01;
  const zoomOut=document.getElementById('mapZoomOut');if(zoomOut)zoomOut.disabled=mapView.scale<=MAP_MIN_SCALE+.01;
}
function setMapScale(nextScale,centerX,centerY){
  const wrap=document.querySelector('.map-page-shell .map-wrap');if(!wrap)return;
  const rect=wrap.getBoundingClientRect();
  const cx=centerX??rect.width/2;const cy=centerY??rect.height/2;
  const next=Math.min(MAP_MAX_SCALE,Math.max(MAP_MIN_SCALE,nextScale));
  const contentX=(cx-mapView.x)/mapView.scale;const contentY=(cy-mapView.y)/mapView.scale;
  mapView.scale=next;mapView.x=cx-contentX*next;mapView.y=cy-contentY*next;
  applyMapView();
}
function zoomMap(direction){setMapScale(mapView.scale+(direction>0?.35:-.35))}
function resetMapView(){
  mapView.scale=1;mapView.x=0;mapView.y=0;applyMapView();
  clearMapSelection();clearMapSearch();setFilter('전체',document.querySelector('#filters .filter'));showToast('행사장 전체 위치로 돌아왔습니다.')
}
function startMapGesture(){
  const points=[...mapPointers.values()];
  if(points.length>=2){
    const [a,b]=points;const rect=document.querySelector('.map-page-shell .map-wrap').getBoundingClientRect();
    const cx=(a.x+b.x)/2-rect.left;const cy=(a.y+b.y)/2-rect.top;
    mapGesture={type:'pinch',distance:Math.hypot(b.x-a.x,b.y-a.y),scale:mapView.scale,contentX:(cx-mapView.x)/mapView.scale,contentY:(cy-mapView.y)/mapView.scale};
  }else if(points.length===1){
    mapGesture={type:'pan',startX:points[0].x,startY:points[0].y,x:mapView.x,y:mapView.y};
  }else mapGesture=null;
}
function setupMapGestures(){
  const wrap=document.querySelector('.map-page-shell .map-wrap');if(!wrap)return;
  wrap.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    suppressMapClick=false;
    mapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(mapPointers.size===1)mapGestureMoved=false;
    startMapGesture();
    if(mapPointers.size>=2){
      mapPointers.forEach((_,pointerId)=>{try{wrap.setPointerCapture(pointerId)}catch(e){}});
      wrap.classList.add('is-dragging');
    }
  });
  wrap.addEventListener('pointermove',event=>{
    if(!mapPointers.has(event.pointerId))return;
    mapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const points=[...mapPointers.values()];if(!mapGesture)return;
    if(points.length>=2&&mapGesture.type==='pinch'){
      const [a,b]=points;const distance=Math.hypot(b.x-a.x,b.y-a.y);const cx=(a.x+b.x)/2-wrap.getBoundingClientRect().left;const cy=(a.y+b.y)/2-wrap.getBoundingClientRect().top;
      mapView.scale=Math.min(MAP_MAX_SCALE,Math.max(MAP_MIN_SCALE,mapGesture.scale*distance/Math.max(1,mapGesture.distance)));
      mapView.x=cx-mapGesture.contentX*mapView.scale;mapView.y=cy-mapGesture.contentY*mapView.scale;
      mapGestureMoved=true;applyMapView();
    }else if(points.length===1&&mapGesture.type==='pan'&&mapView.scale>MAP_MIN_SCALE){
      const dx=points[0].x-mapGesture.startX;const dy=points[0].y-mapGesture.startY;
      if(!mapGestureMoved&&Math.abs(dx)+Math.abs(dy)>4){
        mapGestureMoved=true;wrap.setPointerCapture(event.pointerId);wrap.classList.add('is-dragging');
      }
      if(!mapGestureMoved)return;
      mapView.x=mapGesture.x+dx;mapView.y=mapGesture.y+dy;applyMapView();
    }
  });
  const endPointer=event=>{
    mapPointers.delete(event.pointerId);
    if(!mapPointers.size){
      wrap.classList.remove('is-dragging');
      if(mapGestureMoved)suppressMapClick=true;
    }
    startMapGesture();
  };
  window.addEventListener('pointerup',endPointer);window.addEventListener('pointercancel',endPointer);
  wrap.addEventListener('click',event=>{if(suppressMapClick){suppressMapClick=false;event.preventDefault();event.stopPropagation()}},true);
  wrap.addEventListener('wheel',event=>{
    event.preventDefault();const rect=wrap.getBoundingClientRect();
    setMapScale(mapView.scale+(event.deltaY<0?.25:-.25),event.clientX-rect.left,event.clientY-rect.top);
  },{passive:false});
  window.addEventListener('resize',applyMapView);
  applyMapView();
}
function showCurrentLocation(){showToast('실서비스에서는 GPS로 현재 위치를 지도에 표시합니다.')}
function openPlace(id,pinEl){
  const p=places[id]; if(!p)return;
  document.querySelectorAll('.pin').forEach(x=>x.classList.remove('active'));
  const pin=pinEl||document.querySelector(`.pin[data-id="${id}"]`); if(pin)pin.classList.add('active');
  document.getElementById('sheetContent').innerHTML=`
    <div class="sheet-hero">${p.emoji}</div>
    <h3>${p.name}</h3><div class="sub">${p.category} · ${p.summary}</div>
    <div class="info-row"><b>운영시간</b><span>${p.hours}</span></div>
    <div class="info-row"><b>주요 정보</b><span>${p.info}</span></div>
    <div class="info-row"><b>문의</b><span>${p.contact}</span></div>
    <div class="sheet-actions"><button class="btn" onclick="closeSheet()">닫기</button><button class="btn primary" onclick="showToast('외부 지도 길찾기 연결 예정입니다.')">길찾기</button></div>`;
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('placeSheet').classList.add('open');
}
function noticeCardHtml(n){
  const t=NOTICE_TYPE[n.type]||NOTICE_TYPE.urgent;
  const when=(n.updatedAt&&n.updatedAt.toDate)?n.updatedAt.toDate().toLocaleString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'';
  const body=escapeHtml(n.body||'').replace(/\n/g,'<br>');
  return `<article class="notice-feed-item"><div class="notice-feed-head"><span class="notice-feed-badge${n.type&&n.type!=='urgent'?' '+n.type:''}">${t.emoji} ${t.label}</span>${when?`<span class="notice-feed-time">${when}</span>`:''}</div><strong>${escapeHtml(n.title||t.label)}</strong>${body?`<p>${body}</p>`:''}</article>`;
}
function openNotice(){
  const c=document.getElementById('sheetContent');
  if(liveNotices.length){
    c.innerHTML=`
      <div class="sheet-hero">📢</div>
      <h3>축제 공지</h3><div class="sub">현재 활성 공지 ${liveNotices.length}건</div>
      <div class="notice-feed">${liveNotices.map(noticeCardHtml).join('')}</div>
      <div class="sheet-actions"><button class="btn primary" style="grid-column:1/-1" onclick="closeSheet()">확인</button></div>`;
  }else{
    c.innerHTML=`
      <div class="sheet-hero">📢</div>
      <h3>축제 공지</h3><div class="sub">축제 당일 변경 사항과 주요 안내</div>
      <div class="info-row"><b>긴급</b><span>현장 상황에 따라 공연 시간이 변경될 수 있습니다. 변경 시 이 화면에서 즉시 안내합니다.</span></div>
      <div class="info-row"><b>주차</b><span>행사장 주변이 혼잡할 수 있으니 대중교통 이용을 권장합니다.</span></div>
      <div class="info-row"><b>안전</b><span>응급 상황은 112 또는 현장 운영 안내소로 연락하세요.</span></div>
      <div class="sheet-actions"><button class="btn primary" style="grid-column:1/-1" onclick="closeSheet()">확인</button></div>`;
  }
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('placeSheet').classList.add('open');
  markNoticeSeen();
}
function closeSheet(){
  document.getElementById('sheetBackdrop').classList.remove('open');
  document.getElementById('placeSheet').classList.remove('open');
  document.querySelectorAll('.pin').forEach(x=>x.classList.remove('active'));
}
function focusPin(id){setTimeout(()=>selectMapPlace(id,document.querySelector(`#festivalMap .pin[data-id=\"${id}\"]`)),180)}
function formatScheduleDate(dateStr){
  if(!dateStr)return'';
  const d=new Date(`${dateStr}T00:00:00`);
  if(Number.isNaN(d.getTime()))return'';
  const week=['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getMonth()+1}.${d.getDate()}(${week})`;
}
function computeScheduleStatus(dateStr,timeStr,endStr){
  const start=new Date(`${dateStr}T${timeStr}:00`);
  const end=new Date(`${dateStr}T${endStr}:00`);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return'next';
  if(end<=start)end.setDate(end.getDate()+1); // 자정을 넘기는 일정 보정
  const now=new Date();
  if(now<start)return'next';
  if(now>end)return'done';
  return'now';
}
let activeScheduleDay=1;
let currentScheduleMode='next';
function renderSchedule(mode=currentScheduleMode,el){
  currentScheduleMode=['next','now','done'].includes(mode)?mode:'next';
  if(el){document.querySelectorAll('.schedule-tab').forEach(b=>b.classList.remove('active'));el.classList.add('active')}
  const rows=schedules
    .filter(s=>s.published!==false&&Number(s.day||1)===activeScheduleDay)
    .map(s=>({...s,_status:computeScheduleStatus(s.date,s.time,s.end)}))
    .filter(s=>s._status===currentScheduleMode);
  document.getElementById('scheduleList').innerHTML=rows.length?rows.map(s=>`<article class="schedule-card ${s._status==='now'?'now':''}"><div class="time-box">${s.date?`<small class="schedule-date">${escapeHtml(formatScheduleDate(s.date))}</small>`:''}<strong>${escapeHtml(s.time)}</strong><span>~ ${escapeHtml(s.end)}</span></div><div><h4>${escapeHtml(s.title)}</h4><p>${escapeHtml(s.desc||'')}</p><div class="schedule-meta"><button class="location" onclick="goPage('map');focusPin('stage')">📍 ${escapeHtml(s.place||'')}</button><span class="status-badge">${s._status==='now'?'진행 중':s._status==='next'?'예정':'완료'}</span></div></div></article>`).join(''):`<div class="stamp-empty">현재 배포된 ${activeScheduleDay}일차의 ${currentScheduleMode==='now'?'진행 중':currentScheduleMode==='next'?'예정':'완료'} 일정이 없습니다.</div>`;
}

let toastTimer;
function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200)
}

renderMapPins();renderPlaces();renderSchedule('next');setupMapGestures();
subscribePlaces();

// ===== 운영본부 실시간 공지 방송 수신 (여러 건) =====
const NOTICE_TYPE={urgent:{label:'긴급 공지',emoji:'📢'},info:{label:'안내',emoji:'ℹ️'},safety:{label:'안전 안내',emoji:'🦺'}};
let liveNotices=[]; // 활성 공지만, 최신순
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function seenNoticeIds(){try{return new Set(JSON.parse(safeStorage.getItem('festival.seenNoticeIds')||'[]'))}catch(e){return new Set()}}
function unseenNotices(){const seen=seenNoticeIds();return liveNotices.filter(n=>!seen.has(n.id))}
function markNoticeSeen(){
  const seen=seenNoticeIds();
  liveNotices.forEach(n=>seen.add(n.id));
  safeStorage.setItem('festival.seenNoticeIds',JSON.stringify([...seen].slice(-100)));
  updateNoticeDot();
}
function updateNoticeDot(){
  const dot=document.querySelector('.notice-dot');
  if(dot)dot.style.display=unseenNotices().length?'block':'none';
}
function applyLiveNotices(){
  const strong=document.querySelector('.home-alert strong');
  const badge=document.querySelector('.home-alert .alert-badge');
  if(liveNotices.length){
    const latest=liveNotices[0];
    const t=NOTICE_TYPE[latest.type]||NOTICE_TYPE.urgent;
    if(strong)strong.textContent=latest.title||t.label;
    if(badge)badge.textContent=liveNotices.length>1?`공지 ${liveNotices.length}건`:t.label;
  }else{
    if(strong)strong.textContent='현장 상황에 따라 공연 시간이 변경될 수 있습니다.';
    if(badge)badge.textContent='긴급 공지';
  }
  updateNoticeDot();
}
applyLiveNotices(); // Firestore 수신 전에도 기본 상태(공지 없음)로 정규화
try{
  db.collection('events').doc(EVENT_ID).collection('broadcast').orderBy('createdAt','desc').onSnapshot(snap=>{
    liveNotices=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(n=>n.active);
    applyLiveNotices();
    // 앱을 켜 둔 참가자에게 아직 못 본 공지를 즉시 팝업으로 노출
    const unseen=unseenNotices();
    if(unseen.length){
      if(unseen.length===1){
        const t=NOTICE_TYPE[unseen[0].type]||NOTICE_TYPE.urgent;
        showToast(`${t.emoji} 새 공지: ${unseen[0].title||t.label}`);
      }else{
        showToast(`📢 새 공지 ${unseen.length}건 도착`);
      }
      openNotice();
    }
  },err=>console.warn('notice listen failed',err));
}catch(e){console.warn('notice subscribe failed',e)}

// ===== 운영본부 실시간 일정 관리 수신 =====
try{
  db.collection('events').doc(EVENT_ID).collection('schedule').onSnapshot(snap=>{
    schedules=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>item.published!==false);
    schedules.sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`));
    renderSchedule(currentScheduleMode);
  },err=>console.warn('schedule listen failed',err));
}catch(e){console.warn('schedule subscribe failed',e)}
try{
  db.collection('events').doc(EVENT_ID).collection('settings').doc('schedule').onSnapshot(doc=>{
    activeScheduleDay=Math.max(1,Math.min(3,Number(doc.exists?doc.data().activeDay:1)||1));
    renderSchedule(currentScheduleMode);
  },err=>console.warn('schedule setting listen failed',err));
}catch(e){console.warn('schedule setting subscribe failed',e)}
setInterval(()=>renderSchedule(currentScheduleMode),30000); // 시간 경과에 따라 상태 자동 갱신
