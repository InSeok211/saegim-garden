// Firebase (구글 실제 OAuth 로그인용)
const firebaseConfig={
  apiKey:"AIzaSyDR9WBSaE7GHtaSPiH1sCLjtfJ85tzVtjM",
  authDomain:"saegim-garden.firebaseapp.com",
  projectId:"saegim-garden",
  storageBucket:"saegim-garden.firebasestorage.app",
  messagingSenderId:"846018467538",
  appId:"1:846018467538:web:fb5fa0e5c9f9056e427f0b"
};
try{firebase.initializeApp(firebaseConfig)}catch(e){}
const googleProvider=new firebase.auth.GoogleAuthProvider();
const auth=firebase.auth();
const db=firebase.firestore();
const cloudFunctions=firebase.app().functions('asia-northeast3');
const EVENT_ID='dadaepo-beer-2026';
const participantPersistenceReady = auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});

let places={
  stage:{name:'메인 무대',category:'편의시설',emoji:'🎤',summary:'해변 가요제 경연과 축하 공연이 열리는 중심 무대',hours:'17:00–21:00',info:'현재 해변 가요제 1부 경연이 진행 중입니다.',contact:'운영 안내소 문의',stampable:false},
  food1:{name:'바다어묵',category:'먹거리',emoji:'🍢',summary:'따뜻한 부산 어묵과 음료를 판매하는 참여 점포',hours:'16:00–21:30',info:'대표 메뉴: 꼬치어묵, 물떡, 어묵국물',contact:'현장 주문',stampable:true,code:'DADAE-001'},
  shop1:{name:'다대포 기념공방',category:'체험·판매',emoji:'🎁',summary:'바다 테마 기념품과 간단한 만들기 체험',hours:'16:00–20:30',info:'판매: 키링, 엽서, 축제 기념 배지',contact:'인스타그램·현장 문의',stampable:true,code:'DADAE-002'},
  food2:{name:'바다 간식 부스',category:'먹거리',emoji:'🍧',summary:'시원한 음료와 축제 간식을 판매하는 참여 부스',hours:'16:00–21:30',info:'대표 메뉴: 슬러시, 아이스크림, 음료',contact:'현장 주문',stampable:true,code:'DADAE-003'},
  experience1:{name:'해변 공예 체험',category:'체험·판매',emoji:'🎨',summary:'다대포 바다를 주제로 작은 공예품을 만드는 체험 부스',hours:'16:00–20:30',info:'체험: 바다 키링과 미니 배지 만들기',contact:'현장 접수',stampable:true,code:'DADAE-004'},
  info:{name:'운영 안내소',category:'편의시설',emoji:'ℹ️',summary:'행사 안내, 분실물, 일정 변경과 경품 수령 문의',hours:'15:30–행사 종료',info:'분실물 접수와 미션 경품 수령을 지원합니다.',contact:'051-000-0000',stampable:true,code:'DADAE-005'},
  toilet:{name:'공중화장실',category:'편의시설',emoji:'🚻',summary:'행사장 북쪽 공중화장실',hours:'상시 이용',info:'장애인 화장실과 기저귀 교환대가 있습니다.',contact:'-',stampable:false},
  parking:{name:'임시 주차장',category:'편의시설',emoji:'🅿️',summary:'행사 방문객 임시 주차 구역',hours:'15:00–22:00',info:'혼잡 시 대중교통 이용을 권장합니다.',contact:'주차 안내요원 문의',stampable:false}
};

let REQUIRED_STAMPS=5;
const safeStorage=(()=>{
  try{const k='__dadepo_test__';localStorage.setItem(k,'1');localStorage.removeItem(k);return localStorage}
  catch(e){const mem={};return{getItem:k=>Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]},clear:()=>Object.keys(mem).forEach(k=>delete mem[k])}}
})();
const queryParams=new URLSearchParams(location.search);
// QR 자동 로그인 식별자: ?participant= / ?id= / ?login= 지원
const urlParticipant=(queryParams.get('participant')||queryParams.get('id')||queryParams.get('login')||'').trim()||null;
let participantId=urlParticipant||safeStorage.getItem('festival.participantCode')||safeStorage.getItem('dadepo_participant_id')||'발급 중';
let participationMode=safeStorage.getItem('dadepo_participation_mode')||'anonymous';
let authMethod=safeStorage.getItem('dadepo_auth_method')||'';
let currentUserUid=safeStorage.getItem('festival.uid')||safeStorage.getItem('dadepo_auth_uid')||'';
let stampStorageKey=`dadepo_stamp_demo_${participantId}`;
let stampRecords=JSON.parse(safeStorage.getItem(stampStorageKey)||'[]');
function saveStampRecords(){
  safeStorage.setItem(stampStorageKey,JSON.stringify(stampRecords));
  if(participationMode==='account'&&currentUserUid&&!currentUserUid.startsWith('local-')){
    db.collection('festivalParticipants').doc(participantId).set({
      participantId,
      userUid:currentUserUid,
      authMethod,
      records:stampRecords,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true}).catch(err=>console.warn('stamp sync failed',err));
  }
}
function switchParticipant(nextId,mode,auth=''){
  participantId=nextId;
  participationMode=mode;
  authMethod=auth;
  safeStorage.setItem('dadepo_participant_id',participantId);
  safeStorage.setItem('festival.participantCode',participantId);
  safeStorage.setItem('dadepo_participation_mode',participationMode);
  safeStorage.setItem('dadepo_auth_method',authMethod);
  if(mode!=='account'&&mode!=='anonymous'){
    currentUserUid='';
    safeStorage.removeItem('dadepo_auth_uid');
    safeStorage.removeItem('festival.uid');
  }
  stampStorageKey=`dadepo_stamp_demo_${participantId}`;
  stampRecords=JSON.parse(safeStorage.getItem(stampStorageKey)||'[]');
}
function hasStamp(spotId){return stampRecords.some(r=>r.spotId===spotId)}
function stampablePlaces(){return Object.entries(places).filter(([_,p])=>p.stampable).slice(0,REQUIRED_STAMPS)}


let schedules=[]; // 운영본부 모니터에서 실시간으로 채워짐

function goPage(id,navEl){
  if(id!=='scan') stopScanner();
  document.body.classList.toggle('map-mode',id==='map');
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id));
  if(id!=='map') toggleMapList(false);
  window.scrollTo({top:0,behavior:id==='map'?'auto':'smooth'});
  if(id==='map') renderPlaces(currentFilter);
  if(id==='scan') renderStampUI();
  if(id==='schedule'&&!document.querySelector('#scheduleList').children.length) renderSchedule('now');
}

let currentFilter='전체';
let mapSearchQuery='';
let selectedMapPlaceId=null;
function getFilteredPlaces(){
  const q=mapSearchQuery.trim().toLowerCase();
  return Object.entries(places).filter(([id,p])=>{
    const categoryMatch=currentFilter==='전체'||(currentFilter==='미획득'?p.stampable&&!hasStamp(id):p.category===currentFilter);
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
    const state=p.stampable?(hasStamp(id)?'<i class="stamp-state done">도장 완료</i>':'<i class="stamp-state todo">미획득</i>'):'';
    return `<button class="place-card" onclick="selectMapPlace('${id}');toggleMapList(false)"><span class="place-thumb">${p.emoji}</span><span><h4>${p.name}</h4><p>${p.summary}</p><i class="place-tag">${p.category}</i>${state}</span><span class="chev">›</span></button>`;
  }).join(''):'<div class="map-list-empty">조건에 맞는 점포나 시설이 없습니다.</div>';
  const count=document.getElementById('mapResultCount');if(count)count.textContent=rows.length;
  const subtitle=document.getElementById('mapListSubtitle');if(subtitle)subtitle.textContent=`${currentFilter}${mapSearchQuery?' 검색':''} · ${rows.length}곳`;
  const status=document.getElementById('mapStatusText');if(status)status.textContent=mapSearchQuery?`“${mapSearchQuery}” 검색 결과 ${rows.length}곳`:`${currentFilter} ${rows.length}곳 보기`;
  updateMapPins(rows.map(r=>r[0]));
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
  const state=p.stampable?(hasStamp(id)?'도장 완료':'도장 미획득'):'편의시설';
  const actionIcon=p.stampable&&!hasStamp(id)?'<svg viewBox="0 0 24 24"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M5 19 19 5M8 5h11v11"/></svg>';
  const action=p.stampable&&!hasStamp(id)?`goPage('scan');toggleScannerPanel(true)`:`showToast('길찾기는 실제 지도 연결 단계에서 적용됩니다.')`;
  const preview=document.getElementById('mapPlacePreview');
  preview.innerHTML=`<span class="map-preview-icon">${p.emoji}</span><span class="map-preview-copy"><strong>${p.name}</strong><span>${p.category} · ${p.hours}</span><span class="map-preview-state">${state}</span></span><span class="map-preview-actions"><button onclick="showSelectedPlaceDetails()" aria-label="상세 정보"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/></svg></button><button class="primary" onclick="${action}" aria-label="${p.stampable&&!hasStamp(id)?'QR 스캔':'길찾기'}">${actionIcon}</button></span>`;
  preview.hidden=false;
  const status=document.getElementById('mapStatusText');if(status)status.textContent=`${p.name} 선택됨`;
}
function showSelectedPlaceDetails(){if(selectedMapPlaceId)openPlace(selectedMapPlaceId)}
function clearMapSelection(){
  selectedMapPlaceId=null;
  document.querySelectorAll('#festivalMap .pin').forEach(x=>x.classList.remove('active'));
  const preview=document.getElementById('mapPlacePreview');if(preview)preview.hidden=true;
}
function resetMapView(){clearMapSelection();clearMapSearch();setFilter('전체',document.querySelector('#filters .filter'));showToast('행사장 전체 위치로 돌아왔습니다.')}
function showCurrentLocation(){showToast('실서비스에서는 GPS로 현재 위치를 지도에 표시합니다.')}
function openPlace(id,pinEl){
  const p=places[id]; if(!p)return;
  document.querySelectorAll('.pin').forEach(x=>x.classList.remove('active'));
  const pin=pinEl||document.querySelector(`.pin[data-id="${id}"]`); if(pin)pin.classList.add('active');
  const stampInfo=p.stampable?(hasStamp(id)?'✓ 도장 획득 완료':`아직 받지 않은 도장 · 코드 ${p.code}`):'도장 미운영 시설';
  const scanButton=p.stampable&&!hasStamp(id)?`<button class="btn primary" onclick="closeSheet();goPage('scan');toggleScannerPanel(true)">QR 스캔</button>`:`<button class="btn primary" onclick="showToast('외부 지도 길찾기 연결 예정입니다.')">길찾기</button>`;
  document.getElementById('sheetContent').innerHTML=`
    <div class="sheet-hero">${p.emoji}</div>
    <h3>${p.name}</h3><div class="sub">${p.category} · ${p.summary}</div>
    <div class="info-row"><b>도장 상태</b><span>${stampInfo}</span></div>
    <div class="info-row"><b>운영시간</b><span>${p.hours}</span></div>
    <div class="info-row"><b>주요 정보</b><span>${p.info}</span></div>
    <div class="info-row"><b>문의</b><span>${p.contact}</span></div>
    <div class="sheet-actions"><button class="btn" onclick="closeSheet()">닫기</button>${scanButton}</div>`;
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
let currentScheduleMode='now';
function renderSchedule(mode=currentScheduleMode,el){
  currentScheduleMode=mode;
  if(el){document.querySelectorAll('.schedule-tab').forEach(b=>b.classList.remove('active'));el.classList.add('active')}
  const withStatus=schedules.map(s=>({...s,_status:computeScheduleStatus(s.date,s.time,s.end)}));
  let rows=mode==='all'?withStatus:withStatus.filter(s=>s._status===mode);
  if(!rows.length&&mode==='now')rows=withStatus.filter(s=>s._status==='next').slice(0,1);
  document.getElementById('scheduleList').innerHTML=rows.length?rows.map(s=>`<article class="schedule-card ${s._status==='now'?'now':''}"><div class="time-box">${s.date?`<small class="schedule-date">${escapeHtml(formatScheduleDate(s.date))}</small>`:''}<strong>${escapeHtml(s.time)}</strong><span>~ ${escapeHtml(s.end)}</span></div><div><h4>${escapeHtml(s.title)}</h4><p>${escapeHtml(s.desc||'')}</p><div class="schedule-meta"><button class="location" onclick="goPage('map');focusPin('stage')">📍 ${escapeHtml(s.place||'')}</button>${s._status==='now'?'<span class="status-badge">진행 중</span>':s._status==='next'?'<span class="status-badge">예정</span>':''}</div></div></article>`).join(''):`<div class="stamp-empty">아직 등록된 일정이 없습니다.</div>`;
}

let qrStream=null, qrScanTimer=null, qrDetector=null, lastQrValue='';
let qrCanvas=null, qrCanvasCtx=null;

function hasNativeDetector(){return 'BarcodeDetector' in window}

// iOS Safari(및 iOS의 모든 브라우저)는 BarcodeDetector를 지원하지 않으므로
// jsQR(순수 JS 디코더)로 캔버스 프레임을 직접 분석하는 폴백을 사용한다.
async function detectQrFromVideo(video){
  if(hasNativeDetector()){
    qrDetector=qrDetector||new BarcodeDetector({formats:['qr_code']});
    const codes=await qrDetector.detect(video);
    return codes.length?(codes[0].rawValue||''):null;
  }
  if(typeof jsQR==='undefined'||!video.videoWidth||!video.videoHeight)return null;
  if(!qrCanvas){qrCanvas=document.createElement('canvas');qrCanvasCtx=qrCanvas.getContext('2d',{willReadFrequently:true})}
  qrCanvas.width=video.videoWidth;
  qrCanvas.height=video.videoHeight;
  qrCanvasCtx.drawImage(video,0,0,qrCanvas.width,qrCanvas.height);
  const imageData=qrCanvasCtx.getImageData(0,0,qrCanvas.width,qrCanvas.height);
  const result=jsQR(imageData.data,imageData.width,imageData.height,{inversionAttempts:'dontInvert'});
  return result?result.data:null;
}

async function startScanner(){
  const status=document.getElementById('scanStatus');
  const video=document.getElementById('qrVideo');
  const placeholder=document.getElementById('scannerPlaceholder');
  const frame=document.getElementById('scanFrame');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    status.textContent='이 브라우저에서는 카메라를 사용할 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.';
    return;
  }
  if(!hasNativeDetector()&&typeof jsQR==='undefined'){
    status.textContent='이 브라우저는 QR 자동 인식을 지원하지 않습니다. 다른 브라우저에서 다시 시도해 주세요.';
    return;
  }
  try{
    stopScanner();
    qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:720}},audio:false});
    video.srcObject=qrStream;
    await video.play();
    video.style.display='block';
    placeholder.style.display='none';
    frame.style.display='block';
    status.textContent='점포 QR을 화면 안에 맞추면 자동으로 인식됩니다.';
    const scannerView=document.getElementById('scannerView');
    if(scannerView)scannerView.setAttribute('aria-label','QR 스캔 중');
    scanVideoFrame();
  }catch(err){
    status.textContent='카메라를 사용할 수 없어요. 브라우저 권한을 확인하거나 직원에게 문의해주세요.';
  }
}

function handleScannerSurfaceTap(){
  if(qrStream)return;
  startScanner();
}

function handleScannerSurfaceKey(event){
  if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    handleScannerSurfaceTap();
  }
}

async function scanVideoFrame(){
  const video=document.getElementById('qrVideo');
  if(!qrStream)return;
  try{
    const value=await detectQrFromVideo(video);
    if(value){
      handleQrResult(value||'QR 코드 확인');
      return;
    }
  }catch(e){}
  qrScanTimer=setTimeout(scanVideoFrame,250);
}

function stopScanner(){
  if(qrScanTimer){clearTimeout(qrScanTimer);qrScanTimer=null}
  if(qrStream){qrStream.getTracks().forEach(t=>t.stop());qrStream=null}
  const video=document.getElementById('qrVideo');
  if(video){video.pause();video.srcObject=null;video.style.display='none'}
  const placeholder=document.getElementById('scannerPlaceholder');
  const frame=document.getElementById('scanFrame');
  if(placeholder)placeholder.style.display='block';
  if(frame)frame.style.display='none';
  const scannerView=document.getElementById('scannerView');
  if(scannerView)scannerView.setAttribute('aria-label','QR 스캔 시작');
  const btn=document.getElementById('startScanBtn');
  if(btn){btn.textContent='카메라 시작';btn.onclick=startScanner}
}

async function scanImageFile(input){
  const file=input.files&&input.files[0];
  const status=document.getElementById('scanStatus');
  if(!file)return;
  if(!hasNativeDetector()&&typeof jsQR==='undefined'){
    status.textContent='현재 브라우저는 이미지 QR 인식을 지원하지 않습니다. 코드를 직접 입력해주세요.';
    input.value='';return;
  }
  try{
    const bitmap=await createImageBitmap(file);
    let value=null;
    if(hasNativeDetector()){
      qrDetector=qrDetector||new BarcodeDetector({formats:['qr_code']});
      const codes=await qrDetector.detect(bitmap);
      value=codes.length?(codes[0].rawValue||''):null;
    }else{
      const canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(bitmap,0,0);
      const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
      const result=jsQR(imageData.data,imageData.width,imageData.height,{inversionAttempts:'dontInvert'});
      value=result?result.data:null;
    }
    bitmap.close();
    if(value)handleQrResult(value);
    else status.textContent='이미지에서 QR 코드를 찾지 못했습니다. QR이 선명한 사진으로 다시 시도해주세요.';
  }catch(err){status.textContent='이미지를 읽지 못했습니다. 다른 사진을 선택해주세요.'}
  input.value='';
}

function toggleScannerPanel(open){
  const panel=document.getElementById('scannerWorkspace');
  panel.classList.toggle('open',!!open);
  if(open)setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),80);else stopScanner();
}

function findSpotByQr(value){
  const raw=String(value||'').trim();
  let code=raw.toUpperCase();
  try{
    if(/^https?:\/\//i.test(raw)){
      const u=new URL(raw);code=(u.searchParams.get('code')||u.searchParams.get('spot')||u.pathname.split('/').filter(Boolean).pop()||'').toUpperCase();
    }
  }catch(e){}
  return Object.entries(places).find(([id,p])=>p.stampable&&(p.code===code||id.toUpperCase()===code));
}

function addStamp(spotId){
  const p=places[spotId];
  if(!p||!p.stampable){showToast('도장 적립 장소가 아닙니다.');return}
  if(hasStamp(spotId)){showToast('이미 받은 도장입니다.');renderStampUI();return}
  stampRecords.push({spotId,stampedAt:new Date().toISOString()});
  saveStampRecords();
  renderStampUI();renderPlaces(currentFilter);
  showStampSuccess(p);
}

async function addStamp(spotId){
  const p=places[spotId];
  if(!p||!p.stampable){showToast('도장 받을 장소가 아닙니다.');return}
  if(hasStamp(spotId)){showToast('이미 받은 도장입니다.');renderStampUI();return}
  try{
    if(participationMode==='anonymous'&&currentUserUid&&!currentUserUid.startsWith('local-')){
      document.getElementById('scanStatus').textContent='서버에서 도장을 확인하는 중입니다.';
      const claimed=await claimStampOnServer(spotId);
      if(claimed.alreadyClaimed){showToast('이미 받은 도장입니다.');await loadRemoteStampRecords();renderStampUI();return}
    }else if(!allowLocalFallback()){
      showToast('참가권 확인 후 다시 시도해 주세요.');
      return;
    }
    stampRecords.push({spotId,stampedAt:new Date().toISOString()});
    saveStampRecords();
    renderStampUI();renderPlaces(currentFilter);
    showStampSuccess(p);
  }catch(err){
    console.error(err);
    if(allowLocalFallback()){
      stampRecords.push({spotId,stampedAt:new Date().toISOString()});
      saveStampRecords();
      renderStampUI();renderPlaces(currentFilter);
      showStampSuccess(p);
      return;
    }
    document.getElementById('scanStatus').textContent='도장을 저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.';
    showToast('도장을 저장하지 못했습니다.');
  }
}

function showStampSuccess(p){
  document.getElementById('sheetContent').innerHTML=`
    <div class="sheet-hero">${p.emoji}</div><h3>도장이 찍혔어요!</h3>
    <div class="sub">${p.name} 방문 도장을 획득했습니다.</div>
    <div class="info-row"><b>진행률</b><span>${stampRecords.length} / ${REQUIRED_STAMPS}개 완료</span></div>
    <div class="info-row"><b>다음 행동</b><span>${stampRecords.length>=REQUIRED_STAMPS?'운영 안내소에서 개인 QR을 보여주고 경품을 확인하세요.':'지도에서 아직 받지 않은 도장을 확인하세요.'}</span></div>
    <div class="sheet-actions"><button class="btn" onclick="closeSheet()">확인</button><button class="btn primary" onclick="closeSheet();goPage('map');setFilter('미획득')">다음 장소</button></div>`;
  document.getElementById('sheetBackdrop').classList.add('open');document.getElementById('placeSheet').classList.add('open');
}

function handleQrResult(value){
  lastQrValue=String(value||'').trim();
  stopScanner();
  const result=document.getElementById('qrResult');
  document.getElementById('qrResultText').textContent=lastQrValue;
  result.classList.add('show');
  const spot=findSpotByQr(lastQrValue);
  if(!spot){document.getElementById('scanStatus').textContent='등록되지 않은 점포 QR입니다.';showToast('유효한 점포 QR이 아닙니다.');return}
  document.getElementById('scanStatus').textContent=`${spot[1].name} QR을 확인했습니다.`;
  addStamp(spot[0]);
}

function submitManualCode(){
  const input=document.getElementById('manualQrCode');
  const value=input.value.trim();
  if(!value){showToast('점포 코드를 입력해주세요.');return}
  handleQrResult(value.toUpperCase());input.value='';
}

function renderStampUI(){
  const spots=stampablePlaces();
  const count=Math.min(stampRecords.length,REQUIRED_STAMPS);
  const board=document.getElementById('stampBoard');
  if(board)board.innerHTML=spots.map(([id,p])=>hasStamp(id)?`<div class="stamp-slot done"><span><b class="stamp-emoji">${p.emoji}</b>${p.name}</span></div>`:`<div class="stamp-slot"><span><b class="stamp-emoji">○</b>${p.name}</span></div>`).join('');
  const bar=document.getElementById('stampProgressBar');if(bar)bar.style.width=`${Math.min(100,count/REQUIRED_STAMPS*100)}%`;
  const txt=document.getElementById('stampProgressText');if(txt)txt.textContent=`${count} / ${REQUIRED_STAMPS}개 완료`;
  const chip=document.getElementById('rewardChip');if(chip)chip.textContent=count>=REQUIRED_STAMPS?'경품 수령 가능':'미션 진행 중';
  const pid=document.getElementById('participantIdText');if(pid)pid.textContent=participantId;
  const methodLabel=participationMode==='anonymous'?'비로그인 QR 참여':participationMode==='qr'?'개인 QR 카드':authMethod==='kakao'?'카카오 로그인':authMethod==='google'?'Google 로그인':'아이디 로그인';
  const homeLabel=document.getElementById('homeParticipantLabel');if(homeLabel)homeLabel.textContent=`${methodLabel} · ${participantId}`;
  const typeText=document.getElementById('participantTypeText');if(typeText)typeText.textContent=methodLabel;
  const desc=document.getElementById('stampPageDescription');if(desc)desc.textContent=participationMode==='qr'?'개인 QR 카드에 점포·부스 방문 도장이 저장됩니다.':'로그인 계정에 점포·부스 방문 도장이 저장됩니다.';
  const identityBtn=document.getElementById('identityInfoButton');if(identityBtn)identityBtn.textContent=participationMode==='qr'?'내 개인 QR 보기':'내 계정 정보 보기';
  const homeCount=document.getElementById('homeStampCount');if(homeCount)homeCount.textContent=`현재 ${count} / ${REQUIRED_STAMPS}개`;
  const homeMsg=document.getElementById('homeStampMessage');if(homeMsg)homeMsg.textContent=count>=REQUIRED_STAMPS?'미션 완료! 운영 안내소에서 경품을 확인하세요.':'참여 점포 QR을 스캔해 도장을 모아보세요.';
  const hist=document.getElementById('stampHistory');
  if(hist){
    const records=[...stampRecords].reverse();
    hist.innerHTML=records.length?records.map(r=>{const p=places[r.spotId];return `<div class="stamp-history-row"><span class="mark">${p.emoji}</span><div><b>${p.name}</b><span>${new Date(r.stampedAt).toLocaleString('ko-KR',{hour:'2-digit',minute:'2-digit'})} · 도장 획득</span></div></div>`}).join(''):`<div class="stamp-empty">아직 받은 도장이 없습니다.<br>점포·부스 QR을 스캔하면 기록이 여기에 표시됩니다.</div>`;
  }
}

function showPersonalQr(){
  if(participationMode==='qr'||participationMode==='anonymous'){
    document.getElementById('sheetContent').innerHTML=`
      <div class="personal-qr-visual"><i class="personal-qr-third"></i></div>
      <h3 style="text-align:center">나의 참가 정보</h3><div class="sub" style="text-align:center">참가번호 ${participantId}</div>
      <div class="info-row"><b>참여 방식</b><span>${participationMode==='anonymous'?'비로그인 QR 스탬프':'사전 발급 개인 QR 카드'}</span></div>
      <div class="info-row"><b>역할</b><span>경품 수령 시 참가자를 확인하고 기존 도장판을 찾는 보조 번호입니다.</span></div>
      <div class="info-row"><b>주의</b><span>처음 시작한 브라우저에서 계속 이용해 주세요.</span></div>
      <div class="sheet-actions"><button class="btn" onclick="closeSheet()">닫기</button><button class="btn primary" onclick="showToast('실서비스에서는 개인 QR 이미지를 저장합니다.')">QR 저장</button></div>`;
  }else{
    const loginName=authMethod==='kakao'?'카카오':authMethod==='google'?'Google':'아이디·비밀번호';
    document.getElementById('sheetContent').innerHTML=`
      <div class="sheet-hero">👤</div><h3>나의 계정 참여 정보</h3><div class="sub">운영 참가번호 ${participantId}</div>
      <div class="info-row"><b>로그인 방식</b><span>${loginName}</span></div>
      <div class="info-row"><b>기록 복구</b><span>처음 참여할 때 선택한 ${loginName} 방식으로 다시 로그인하면 기존 기록을 불러옵니다.</span></div>
      <div class="info-row"><b>경품 확인</b><span>운영 안내소에서 참가번호 ${participantId}를 보여주세요.</span></div>
      <div class="sheet-actions"><button class="btn primary" style="grid-column:1/-1" onclick="closeSheet()">확인</button></div>`;
  }
  document.getElementById('sheetBackdrop').classList.add('open');document.getElementById('placeSheet').classList.add('open');
}
function showRecoveryHelp(){
  if(participationMode==='anonymous') showToast('처음 참여한 브라우저에서 다시 접속하면 기존 도장판을 불러옵니다.');
  else if(participationMode==='qr') showToast('개인 QR 카드를 다시 스캔하면 기존 도장판을 불러옵니다.');
  else showToast('처음 선택한 로그인 방식으로 다시 로그인해 주세요.');
}

let toastTimer;
function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200)
}

let entryStartedAt=Number(safeStorage.getItem('dadepo_entry_started_at')||Date.now());
safeStorage.setItem('dadepo_entry_started_at',String(entryStartedAt));
let entryHistory=['entry-method'];
function logExperimentEvent(type,data={}){
  const key='dadepo_experiment_events';
  const events=JSON.parse(safeStorage.getItem(key)||'[]');
  events.push({type,at:new Date().toISOString(),...data});
  safeStorage.setItem(key,JSON.stringify(events.slice(-300)));
}
function setEntryStatus(message){
  const status=document.getElementById('entryStartStatus');
  if(status)status.textContent=message;
}
function getPersistentRequestId(){
  const key='festival.pendingRequestId';
  let requestId=safeStorage.getItem(key);
  if(!requestId){
    requestId=(window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():`req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    safeStorage.setItem(key,requestId);
  }
  return requestId;
}
function participantCodeFromUid(uid){
  return `A${parseInt(hashText(uid).slice(0,6),36).toString().padStart(5,'0').slice(0,5)}`;
}
function allowLocalFallback(){
  return ['localhost','127.0.0.1'].includes(location.hostname)||queryParams.get('devFallback')==='1';
}
async function ensureAnonymousUser(){
  await participantPersistenceReady;
  const existing=auth.currentUser;
  if(existing&&existing.isAnonymous)return {uid:existing.uid,localOnly:false};
  try{
    const result=await auth.signInAnonymously();
    return {uid:result.user.uid,localOnly:false};
  }catch(err){
    console.warn('anonymous auth failed',err);
    if(!allowLocalFallback()){
      setEntryStatus('요청이 많아 잠시 후 다시 시도해 주세요. 같은 휴대폰에서 반복 테스트 중이면 몇 분 뒤 다시 눌러주세요.');
      throw err;
    }
    const key='festival.localAnonymousUid';
    let uid=safeStorage.getItem(key);
    if(!uid){
      uid=`local-${hashText(`${Date.now()}-${Math.random()}`)}`;
      safeStorage.setItem(key,uid);
    }
    setEntryStatus('Firebase 익명 로그인이 아직 꺼져 있어 로컬 개발용 참가권으로 시작합니다.');
    return {uid,localOnly:true,error:err};
  }
}
async function registerAnonymousParticipant(uid,requestId,localOnly=false){
  const cached=safeStorage.getItem('festival.participantCode');
  if(cached&&cached!=='발급 중')return cached;
  if(localOnly){
    const participantCode=participantCodeFromUid(uid);
    safeStorage.setItem('festival.participantCode',participantCode);
    safeStorage.setItem('festival.eventId',EVENT_ID);
    safeStorage.removeItem('festival.pendingRequestId');
    return participantCode;
  }

  let participantCode='';
  try{
    const registerParticipant=cloudFunctions.httpsCallable('registerParticipant');
    const result=await registerParticipant({eventId:EVENT_ID,requestId});
    participantCode=result&&result.data&&result.data.participantCode;
  }catch(err){
    console.warn('registerParticipant function failed',err);
    if(!allowLocalFallback())throw err;
    participantCode=participantCodeFromUid(uid);
  }
  if(!participantCode)throw new Error('registerParticipant returned no participantCode');
  safeStorage.setItem('festival.participantCode',participantCode);
  safeStorage.setItem('festival.eventId',EVENT_ID);
  safeStorage.removeItem('festival.pendingRequestId');
  return participantCode;
}
function getStampRequestId(spotId){
  const key=`festival.stampRequest.${spotId}`;
  let requestId=safeStorage.getItem(key);
  if(!requestId){
    requestId=(window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():`stamp-${spotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    safeStorage.setItem(key,requestId);
  }
  return requestId;
}
async function claimStampOnServer(spotId){
  const p=places[spotId];
  const requestId=getStampRequestId(spotId);
  const claimStamp=cloudFunctions.httpsCallable('claimStamp');
  const result=await claimStamp({eventId:EVENT_ID,pointId:spotId,code:p.code,requestId});
  safeStorage.removeItem(`festival.stampRequest.${spotId}`);
  return result&&result.data?result.data:{};
}
async function startAnonymousEntry(){
  const button=document.getElementById('startStampTourBtn');
  if(button)button.disabled=true;
  setEntryStatus('익명 참가권을 확인하는 중입니다.');
  try{
    const requestId=getPersistentRequestId();
    const user=await ensureAnonymousUser();
    currentUserUid=user.uid;
    safeStorage.setItem('festival.uid',currentUserUid);
    safeStorage.setItem('dadepo_auth_uid',currentUserUid);
    setEntryStatus('참가번호를 준비하는 중입니다. 스탬프판은 바로 열립니다.');
    const code=await registerAnonymousParticipant(user.uid,requestId,user.localOnly);
    const preview=document.getElementById('entryPreviewCode');
    if(preview)preview.textContent=`참가번호 ${code}`;
    logExperimentEvent('anonymous_entry_started',{eventId:EVENT_ID,participant_id:code,local_only:Boolean(user.localOnly)});
    finishEntry(code,'anonymous','anonymous');
  }catch(err){
    console.error(err);
    setEntryStatus('시작하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.');
    if(button)button.disabled=false;
  }
}
function idToEmail(id){return `${id}@dadaepo-festival.local`}
function hashText(text){
  let hash=2166136261;
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36).toUpperCase().padStart(6,'0').slice(0,6);
}
function participantFromUid(uid,auth){
  const prefix=auth==='google'?'M-G':auth==='id'?'M-I':'M-A';
  return `${prefix}-${hashText(uid)}`;
}
function mergeStampRecords(remoteRecords=[]){
  const merged=new Map();
  [...stampRecords,...remoteRecords].forEach(record=>{
    if(!record||!record.spotId)return;
    const current=merged.get(record.spotId);
    if(!current||String(record.stampedAt||'')<String(current.stampedAt||''))merged.set(record.spotId,record);
  });
  stampRecords=[...merged.values()].sort((a,b)=>String(a.stampedAt||'').localeCompare(String(b.stampedAt||'')));
  safeStorage.setItem(stampStorageKey,JSON.stringify(stampRecords));
}
async function ensureFirebaseParticipant(user,method,loginId=''){
  const profileRef=db.collection('festivalUsers').doc(user.uid);
  const profile=await profileRef.get();
  let participant=profile.exists&&profile.data().participantId;
  if(!participant)participant=participantFromUid(user.uid,method);
  const profileData={
    uid:user.uid,
    participantId:participant,
    authMethod:method,
    loginId:loginId||null,
    updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
  };
  if(!profile.exists)profileData.createdAt=firebase.firestore.FieldValue.serverTimestamp();
  await profileRef.set(profileData,{merge:true});
  currentUserUid=user.uid;
  safeStorage.setItem('dadepo_auth_uid',currentUserUid);
  return participant;
}
async function loadRemoteStampRecords(){
  if((participationMode!=='account'&&participationMode!=='anonymous')||!currentUserUid||currentUserUid.startsWith('local-'))return;
  try{
    if(participationMode==='anonymous'){
      const snap=await db.collection('events').doc(EVENT_ID).collection('participants').doc(currentUserUid).collection('stamps').get();
      if(!snap.empty){
        mergeStampRecords(snap.docs.map(doc=>({spotId:doc.id,stampedAt:doc.data().claimedAt||new Date().toISOString()})));
        renderStampUI();
        renderPlaces(currentFilter);
      }
      return;
    }
    const snap=await db.collection('festivalParticipants').doc(participantId).get();
    if(snap.exists&&Array.isArray(snap.data().records)){
      mergeStampRecords(snap.data().records);
      renderStampUI();
      renderPlaces(currentFilter);
    }
  }catch(err){
    console.warn('stamp load failed',err);
    showToast('온라인 기록을 불러오지 못해 이 기기 기록으로 시작합니다.');
  }
}
function setEntryStep(id,push=true){
  document.querySelectorAll('.entry-step').forEach(s=>s.classList.toggle('active',s.id===id));
  if(push&&entryHistory[entryHistory.length-1]!==id)entryHistory.push(id);
  const back=document.getElementById('entryBack');
  if(back)back.hidden=id==='entry-method';
  window.scrollTo({top:0,behavior:'smooth'});
}
function entryBack(){
  if(entryHistory.length<=1){setEntryStep('entry-method',false);return}
  entryHistory.pop();
  setEntryStep(entryHistory[entryHistory.length-1],false);
}
function selectEntryMethod(method){
  logExperimentEvent('participation_method_selected',{method,selection_ms:Date.now()-entryStartedAt});
  if(method==='qr')setEntryStep('entry-qr'); else setEntryStep('entry-login-method');
}
function connectDemoQr(){document.getElementById('personalQrInput').value='P-001';connectPersonalQr()}
function connectPersonalQr(){
  const input=document.getElementById('personalQrInput');
  let code=String(input.value||'').trim().toUpperCase();
  if(!/^P-\d{3}$/.test(code)){alert('참가번호를 P-001 형식으로 입력해 주세요.');input.focus();return}
  logExperimentEvent('personal_qr_connected',{participant_id:code});
  finishEntry(code,'qr','');
}
function openIdAuth(mode){setEntryStep('entry-id-auth');switchAuthTab(mode)}
function switchAuthTab(mode){
  if(!document.getElementById('signupTab'))return;
  document.getElementById('signupTab').classList.toggle('active',mode==='signup');
  document.getElementById('loginTab').classList.toggle('active',mode==='login');
  document.getElementById('signupPanel').classList.toggle('active',mode==='signup');
  document.getElementById('loginPanel').classList.toggle('active',mode==='login');
  const title=document.querySelector('#entry-id-auth .entry-title');
  const desc=document.querySelector('#entry-id-auth .entry-desc');
  if(mode==='signup'){title.innerHTML='간단한 계정을<br>만들어 주세요';desc.textContent='이름·전화번호·이메일 없이 아이디와 비밀번호만 사용합니다.'}
  else{title.innerHTML='기존 계정으로<br>다시 참여하세요';desc.textContent='가입할 때 만든 아이디와 비밀번호를 입력하면 기존 기록을 불러옵니다.'}
}
function togglePassword(id,button){const input=document.getElementById(id);const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'숨김':'보기'}
function nextMemberId(prefix='M-I'){
  const key='dadepo_member_sequence';
  const n=Number(safeStorage.getItem(key)||0)+1;
  safeStorage.setItem(key,String(n));
  return `${prefix}${String(n).padStart(3,'0')}`;
}
function completeSocialLogin(provider){
  logExperimentEvent('login_method_selected',{provider});
  if(provider==='google'){googleLogin();return;}
  // 카카오는 Firebase Auth 제공자 설정을 추가한 뒤 실제 로그인으로 연결합니다.
  const key=`dadepo_${provider}_participant`;
  const existing=safeStorage.getItem(key);
  const pid=existing||nextMemberId('M-K');
  safeStorage.setItem(key,pid);
  logExperimentEvent('social_login_completed',{provider,participant_id:pid});
  finishEntry(pid,'account',provider);
}
// 구글 실제 OAuth (Firebase Auth 팝업)
async function googleLogin(){
  try{
    const res=await auth.signInWithPopup(googleProvider);
    const pid=await ensureFirebaseParticipant(res.user,'google');
    logExperimentEvent('social_login_completed',{provider:'google',participant_id:pid});
    finishEntry(pid,'account','google');
  }catch(err){
    const code=err&&err.code;
    if(code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request')return;
    console.error(err);
    alert('구글 로그인에 실패했습니다. 다시 시도해 주세요.');
  }
}
async function signupWithId(){
  const id=document.getElementById('signupId').value.trim().toLowerCase();
  const pw=document.getElementById('signupPw').value;
  const confirmPw=document.getElementById('signupPwConfirm').value;
  const consent=document.getElementById('signupConsent').checked;
  const error=document.getElementById('signupError');error.textContent='';
  if(!/^[a-z0-9]{4,16}$/.test(id)){error.textContent='아이디는 영문 소문자와 숫자 4~16자로 입력해 주세요.';return}
  if(pw.length<8){error.textContent='비밀번호는 8자 이상 입력해 주세요.';return}
  if(pw!==confirmPw){error.textContent='비밀번호 확인이 일치하지 않습니다.';logExperimentEvent('password_mismatch');return}
  if(!consent){error.textContent='필수 이용 안내에 동의해 주세요.';return}
  error.textContent='계정을 만드는 중입니다.';
  try{
    const res=await auth.createUserWithEmailAndPassword(idToEmail(id),pw);
    const pid=await ensureFirebaseParticipant(res.user,'id',id);
    logExperimentEvent('id_signup_completed',{participant_id:pid});
    finishEntry(pid,'account','id');
  }catch(err){
    console.error(err);
    if(err&&err.code==='auth/email-already-in-use'){error.textContent='이미 사용 중인 아이디입니다.';logExperimentEvent('username_duplicate');return}
    if(err&&err.code==='auth/operation-not-allowed'){error.textContent='Firebase 콘솔에서 이메일/비밀번호 로그인을 먼저 켜야 합니다.';return}
    error.textContent='회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  }
}
async function loginWithId(){
  const id=document.getElementById('loginId').value.trim().toLowerCase();
  const pw=document.getElementById('loginPw').value;
  const error=document.getElementById('loginError');error.textContent='';
  if(!/^[a-z0-9]{4,16}$/.test(id)){error.textContent='아이디를 확인해 주세요.';return}
  if(!pw){error.textContent='비밀번호를 입력해 주세요.';return}
  error.textContent='로그인 확인 중입니다.';
  try{
    const res=await auth.signInWithEmailAndPassword(idToEmail(id),pw);
    const pid=await ensureFirebaseParticipant(res.user,'id',id);
    logExperimentEvent('id_login_completed',{participant_id:pid});
    finishEntry(pid,'account','id');
  }catch(err){
    console.error(err);
    error.textContent='아이디 또는 비밀번호를 확인해 주세요.';
    logExperimentEvent('id_login_failed');
  }
}
function finishEntry(pid,mode,auth){
  switchParticipant(pid,mode,auth);
  safeStorage.setItem('dadepo_entry_complete','1');
  safeStorage.setItem('dadepo_entry_completed_at',new Date().toISOString());
  document.getElementById('entryShell').hidden=true;
  document.getElementById('mainApp').hidden=false;
  renderPlaces();renderSchedule('now');renderStampUI();
  loadRemoteStampRecords();
  goPage('home');
  logExperimentEvent('festival_home_entered',{participant_id:pid,mode,auth_method:auth||null});
}
function resetTestFlow(){
  const confirmed=window.confirm('현재 테스트 데이터를 모두 삭제하고 참여 방식 선택 화면부터 다시 시작할까요?\n\n개인 QR 연결, 로그인 상태, 도장 기록, 임시 아이디 계정이 함께 초기화됩니다.');
  if(!confirmed)return;
  stopScanner();
  closeSheet();
  auth.signOut().catch(err=>console.warn('sign out failed',err));

  // 이 사이트에서 사용하는 테스트 키만 삭제합니다.
  try{
    const keys=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&(key.startsWith('dadepo_')||key.startsWith('festival.')))keys.push(key);
    }
    keys.forEach(key=>localStorage.removeItem(key));
  }catch(e){
    if(typeof safeStorage.clear==='function')safeStorage.clear();
  }

  participantId='발급 중';
  participationMode='anonymous';
  authMethod='';
  currentUserUid='';
  stampStorageKey='dadepo_stamp_demo_pending';
  stampRecords=[];
  entryStartedAt=Date.now();
  safeStorage.setItem('dadepo_entry_started_at',String(entryStartedAt));
  entryHistory=['entry-method'];

  // 입력 폼과 오류 상태도 초기화합니다.
  document.querySelectorAll('#entryShell input').forEach(input=>{
    if(input.type==='checkbox')input.checked=false;
    else input.value=input.id==='personalQrInput'?'P-001':'';
  });
  document.querySelectorAll('.field-error').forEach(el=>el.textContent='');
  document.querySelectorAll('.pw-toggle').forEach(button=>button.textContent='보기');
  ['signupPw','signupPwConfirm','loginPw'].forEach(id=>{const input=document.getElementById(id);if(input)input.type='password'});
  switchAuthTab('signup');

  document.querySelectorAll('.page').forEach(page=>page.classList.toggle('active',page.id==='home'));
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.page==='home'));
  document.getElementById('mainApp').hidden=true;
  document.getElementById('entryShell').hidden=false;
  setEntryStep('entry-method',false);
  history.replaceState(null,'',location.pathname);
  logExperimentEvent('test_flow_reset');
}

function initializeEntryFlow(){
  if(queryParams.get('reset')==='1'){
    ['dadepo_entry_complete','dadepo_participant_id','dadepo_participation_mode','dadepo_auth_method','festival.participantCode','festival.uid','festival.pendingRequestId'].forEach(k=>safeStorage.removeItem(k));
  }
  // 1) QR 전용 URL(?participant=…)로 접속 → 즉시 자동 로그인
  if(urlParticipant){
    switchParticipant(urlParticipant,'qr','');
    safeStorage.setItem('dadepo_entry_complete','1');
    safeStorage.setItem('dadepo_entry_completed_at',new Date().toISOString());
    // 주소창에서 쿼리 파라미터 제거 (?participant=… → 깔끔한 주소)
    history.replaceState(null,'',location.pathname);
    document.getElementById('entryShell').hidden=true;
    document.getElementById('mainApp').hidden=false;
    logExperimentEvent('qr_url_login',{participant_id:urlParticipant});
    return;
  }
  // 2) 파라미터가 없어도 기존 로그인 기록이 있으면 자동 로그인
  const completed=safeStorage.getItem('dadepo_entry_complete')==='1';
  if(completed){
    document.getElementById('entryShell').hidden=true;
    document.getElementById('mainApp').hidden=false;
  }else{
    // 3) 아무 기록도 없으면 참여 방식 선택 화면
    document.getElementById('entryShell').hidden=false;
    document.getElementById('mainApp').hidden=true;
    logExperimentEvent('participation_entry_viewed');
  }
}
initializeEntryFlow();

renderPlaces();renderSchedule('now');renderStampUI();
auth.onAuthStateChanged(user=>{
  if(user&&(participationMode==='account'||participationMode==='anonymous')){
    currentUserUid=user.uid;
    safeStorage.setItem('dadepo_auth_uid',currentUserUid);
    safeStorage.setItem('festival.uid',currentUserUid);
    loadRemoteStampRecords();
  }
});

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
    const appVisible=!document.getElementById('mainApp').hidden;
    const unseen=unseenNotices();
    if(appVisible&&unseen.length){
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
    schedules=snap.docs.map(doc=>({id:doc.id,...doc.data()}));
    schedules.sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`));
    renderSchedule(currentScheduleMode);
  },err=>console.warn('schedule listen failed',err));
}catch(e){console.warn('schedule subscribe failed',e)}
setInterval(()=>{if(!document.getElementById('mainApp').hidden)renderSchedule(currentScheduleMode)},30000); // 시간 경과에 따라 상태 자동 갱신
