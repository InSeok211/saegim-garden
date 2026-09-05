(() => {
  "use strict";

  const EVENT_ID = "dadaepo-beer-2026";
  const firebaseConfig = {
    apiKey: "AIzaSyDR9WBSaE7GHtaSPiH1sCLjtfJ85tzVtjM",
    authDomain: "saegim-garden.firebaseapp.com",
    projectId: "saegim-garden",
    storageBucket: "saegim-garden.firebasestorage.app",
    messagingSenderId: "846018467538",
    appId: "1:846018467538:web:fb5fa0e5c9f9056e427f0b"
  };

  try { firebase.initializeApp(firebaseConfig); } catch (error) {}

  const db = firebase.firestore();
  const auth = typeof firebase.auth === "function" ? firebase.auth() : null;
  const googleProvider = auth ? new firebase.auth.GoogleAuthProvider() : null;
  const cloudFunctions = typeof firebase.functions === "function" ? firebase.app().functions("asia-northeast3") : null;
  const $ = (id) => document.getElementById(id);
  const has = (id) => Boolean($(id));
  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };
  const setHTML = (id, value) => {
    const el = $(id);
    if (el) el.innerHTML = value;
  };
  let unsubscribe = null;
  let latestParticipants = [];
  let participantQuery = "";
  let participantFilter = "all";

  // 부스 목록 — functions/index.js STAMP_POINTS와 동일하게 유지
  let BOOTH_POINTS = {
    food1: "바다어묵",
    shop1: "다대포 기념공방",
    food2: "바다 간식 부스",
    experience1: "해변 공예 체험",
    info: "운영 안내소",
  };

  const ADMIN_EMAIL = "rjbcom4263@gmail.com";
  const placesCol = db.collection("events").doc(EVENT_ID).collection("places");
  let latestPlaces = [];
  let selectedPlaceId = null;
  let placeAdminUser = null;
  let placeDrag = null;
  let currentQrPayload = "";
  let currentQrDataUrl = "";
  let currentQrPlaceId = "";

  function isPlaceAdmin() {
    return Boolean(placeAdminUser && placeAdminUser.email === ADMIN_EMAIL);
  }

  function placeStatus(message, kind) {
    const el = $("placeEditorStatus");
    if (!el) return;
    el.textContent = message || "";
    el.className = "bc-status" + (kind ? " " + kind : "");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || min));
  }

  function normalizePlaceId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  }

  function placeById(id) {
    return latestPlaces.find((place) => place.id === id) || null;
  }

  const MAP_MARKERS = {
    food: { icon: "truck", label: "푸드트럭" }, stage: { icon: "mic-2", label: "무대" }, info: { icon: "info", label: "안내소" },
    toilet: { icon: "toilet", label: "화장실" }, medical: { icon: "cross", label: "의료·안전" }, entrance: { icon: "log-in", label: "출입구" },
    seating: { icon: "armchair", label: "테이블·관람석" }, default: { icon: "map-pin", label: "장소" },
  };

  function markerTypeFor(place) {
    if (place && MAP_MARKERS[place.markerType]) return place.markerType;
    const text = `${place?.id || ""} ${place?.name || ""} ${place?.category || ""}`.toLowerCase();
    if (/화장실|toilet/.test(text)) return "toilet";
    if (/의료|응급|안전|medical/.test(text)) return "medical";
    if (/입구|출구|출입|entrance|gate/.test(text)) return "entrance";
    if (/테이블|관람|스탠드|좌석|seating/.test(text)) return "seating";
    if (/무대|공연|stage/.test(text)) return "stage";
    if (/안내|운영본부|info/.test(text)) return "info";
    if (place?.category === "먹거리" || /푸드|트럭|food/.test(text)) return "food";
    return "default";
  }

  function markerMarkup(place, compact = false) {
    const type = markerTypeFor(place);
    const marker = MAP_MARKERS[type] || MAP_MARKERS.default;
    return `<span class="${compact ? "place-icon marker-mini" : "marker-symbol"} marker-${type}"><i data-lucide="${marker.icon}"></i></span>`;
  }

  function refreshMarkerIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
  }

  function resetPlaceQrPreview() {
    currentQrPayload = "";
    currentQrDataUrl = "";
    currentQrPlaceId = "";
    if (!has("placeQrPreview")) return;
    setHTML("placeQrPreview", "<span>QR 생성·보기를 누르면<br>보안 QR이 표시됩니다.</span>");
    $("placeQrDownloadBtn").disabled = true;
    $("placeQrPrintBtn").disabled = true;
  }

  function updatePlaceQrPanel(place, preservePreview = false) {
    if (!has("placeQrPanel")) return;
    const visible = Boolean(place && place.stampable);
    const previewHasQr = Boolean($("placeQrPreview")?.querySelector("canvas, img"));
    const keepCurrentPreview = visible && (
      (currentQrPlaceId === place.id && (Boolean(currentQrDataUrl) || previewHasQr))
      || (preservePreview && previewHasQr)
    );
    $("placeQrPanel").hidden = !visible;
    if (!keepCurrentPreview) resetPlaceQrPreview();
    if (!visible) return;
    setText("placeQrName", place.name || place.id);
    setText("placeQrVersion", place.qrRequired ? `발급 v${place.qrVersion || 1}` : "미발급");
    setText("placeQrStatus", place.qrRequired
      ? "현재 발급된 보안 QR입니다. QR 재발급 시 이전 인쇄물은 즉시 사용할 수 없게 됩니다."
      : "QR 생성·보기를 누르면 이 장소 전용 보안 QR이 자동 발급됩니다.");
    $("placeQrViewBtn").disabled = !isPlaceAdmin();
    $("placeQrRotateBtn").disabled = !isPlaceAdmin() || !place.qrRequired;
  }

  function renderPlaceQr(result) {
    if (typeof QRCode === "undefined") {
      throw new Error("QR 이미지 모듈을 불러오지 못했습니다.");
    }
    const preview = $("placeQrPreview");
    preview.innerHTML = "";
    new QRCode(preview, {
      text: result.qrPayload,
      width: 220,
      height: 220,
      colorDark: "#082f49",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
    const canvas = preview.querySelector("canvas");
    const image = preview.querySelector("img");
    currentQrPayload = result.qrPayload;
    currentQrDataUrl = canvas ? canvas.toDataURL("image/png") : image ? image.src : "";
    currentQrPlaceId = result.placeId;
    setText("placeQrName", result.placeName || result.placeId);
    setText("placeQrVersion", `발급 v${result.version}`);
    setText("placeQrStatus", result.rotated
      ? "새 보안 QR을 발급했습니다. 다운로드하거나 인쇄해 부스에 부착하세요."
      : "현재 사용 중인 보안 QR입니다. 다운로드하거나 인쇄할 수 있습니다.");
    $("placeQrDownloadBtn").disabled = !currentQrDataUrl;
    $("placeQrPrintBtn").disabled = !currentQrDataUrl;
    $("placeQrRotateBtn").disabled = false;
  }

  async function loadPlaceQr(rotate = false, placeId = selectedPlaceId) {
    if (!isPlaceAdmin() || !placeId || !cloudFunctions) {
      placeStatus("Google 관리자 로그인 후 QR을 발급할 수 있습니다.", "err");
      return;
    }
    const place = placeById(placeId);
    const stampable = selectedPlaceId === placeId && has("placeStampable")
      ? $("placeStampable").checked
      : Boolean(place && place.stampable);
    if (!stampable) {
      placeStatus("먼저 QR 스탬프 장소로 저장해주세요.", "err");
      return;
    }
    if (rotate && !window.confirm("QR을 재발급할까요? 기존에 인쇄한 QR은 즉시 사용할 수 없게 됩니다.")) return;
    $("placeQrViewBtn").disabled = true;
    $("placeQrRotateBtn").disabled = true;
    setText("placeQrStatus", rotate ? "새 보안 QR을 발급하는 중입니다." : "보안 QR을 불러오는 중입니다.");
    try {
      const managePlaceQr = cloudFunctions.httpsCallable("managePlaceQr");
      const response = await managePlaceQr({ eventId: EVENT_ID, placeId, action: rotate ? "rotate" : "get" });
      renderPlaceQr(response.data || {});
      placeStatus(rotate ? "QR을 재발급했습니다." : "QR을 준비했습니다.", "ok");
    } catch (error) {
      console.error(error);
      setText("placeQrStatus", "QR을 준비하지 못했습니다. 잠시 후 다시 시도해주세요.");
      placeStatus("QR 처리 실패: " + error.message, "err");
    } finally {
      $("placeQrViewBtn").disabled = !isPlaceAdmin();
      $("placeQrRotateBtn").disabled = !isPlaceAdmin() || (!placeById(placeId)?.qrRequired && currentQrPlaceId !== placeId);
    }
  }

  function downloadPlaceQr() {
    if (!currentQrDataUrl) return;
    const place = placeById(currentQrPlaceId);
    const safeName = String(place?.name || currentQrPlaceId || "stamp-qr").replace(/[\\/:*?"<>|]/g, "-");
    const link = document.createElement("a");
    link.href = currentQrDataUrl;
    link.download = `${safeName}-스탬프QR.png`;
    link.click();
  }

  function printPlaceQr() {
    if (!currentQrDataUrl) return;
    const place = placeById(currentQrPlaceId);
    const printWindow = window.open("", "_blank", "width=620,height=760");
    if (!printWindow) {
      placeStatus("인쇄 창이 차단되었습니다. 팝업을 허용해주세요.", "err");
      return;
    }
    printWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(place?.name || "스탬프 QR")}</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#12384f}h1{font-size:28px;margin:0 0 10px}p{color:#58768a;margin:0 0 30px}img{width:360px;height:360px;image-rendering:pixelated}.guide{margin-top:28px;font-size:18px;font-weight:800;color:#146c94}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(place?.name || "스탬프 장소")}</h1><p>다대포 해변 축제 · QR 스탬프</p><img src="${currentQrDataUrl}" alt="스탬프 QR"><div class="guide">축제 앱에서 QR을 스캔해주세요</div><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }

  function renderPlaceManager() {
    if (!has("adminPlacePins")) return;
    const sorted = [...latestPlaces].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    setHTML("adminPlacePins", sorted.map((place) => `
      <button class="admin-place-pin marker-${markerTypeFor(place)} ${place.id === selectedPlaceId ? "selected" : ""} ${place.active === false ? "inactive" : ""}"
        type="button" data-place-id="${place.id}" style="left:${clamp(place.x, 3, 94)}%;top:${clamp(place.y, 8, 90)}%" aria-label="${escapeHtml(place.name)}">
        ${markerMarkup(place)}${place.stampable ? '<span class="admin-marker-qr">QR</span>' : ""}
      </button>
    `).join(""));
    setHTML("adminPlaceList", sorted.length ? sorted.map((place) => `
      <button class="admin-place-item ${place.id === selectedPlaceId ? "selected" : ""} ${place.active === false ? "inactive" : ""}" type="button" data-place-id="${place.id}">
        ${markerMarkup(place, true)}
        <span><strong>${escapeHtml(place.name || place.id)}</strong><small>${escapeHtml(place.category || "기타")} · ${place.stampable ? "QR 스탬프" : "일반 장소"}</small></span>
        <span class="place-state ${place.active === false ? "off" : ""}">${place.active === false ? "숨김" : "표시"}</span>
      </button>
    `).join("") : `<div class="empty">등록된 장소가 없습니다. ‘새 장소’를 눌러 추가하세요.</div>`);
    refreshMarkerIcons();
    const activeCount = sorted.filter((place) => place.active !== false).length;
    const stampCount = sorted.filter((place) => place.active !== false && place.stampable).length;
    setText("placeCountText", `표시 ${activeCount}곳 · QR ${stampCount}곳`);
    BOOTH_POINTS = Object.fromEntries(sorted
      .filter((place) => place.stampable)
      .map((place) => [place.id, place.name || place.id]));
    renderBoothPanels();
  }

  function resetPlaceForm() {
    selectedPlaceId = null;
    if (!has("placeForm")) return;
    $("placeForm").reset();
    $("placeId").disabled = false;
    $("placeX").value = "50";
    $("placeY").value = "50";
    $("placeEmoji").value = "📍";
    $("placeMarkerType").value = "food";
    $("placeCategory").value = "먹거리";
    setText("placeFormTitle", "새 장소 추가");
    setText("placeFormMode", "새 장소");
    $("placeRemoveBtn").hidden = true;
    $("placeRestoreBtn").hidden = true;
    if (has("placeQrPanel")) $("placeQrPanel").hidden = true;
    resetPlaceQrPreview();
    placeStatus("");
    renderPlaceManager();
  }

  function selectPlaceForEdit(id, preserveQrPreview = false, rerender = true) {
    const place = placeById(id);
    if (!place || !has("placeForm")) return;
    selectedPlaceId = id;
    $("placeId").value = id;
    $("placeId").disabled = true;
    $("placeEmoji").value = place.emoji || "📍";
    $("placeMarkerType").value = markerTypeFor(place);
    $("placeName").value = place.name || "";
    $("placeCategory").value = place.category || "기타";
    $("placeHours").value = place.hours || "";
    $("placeSummary").value = place.summary || "";
    $("placeInfo").value = place.info || "";
    $("placeContact").value = place.contact || "";
    $("placeX").value = clamp(place.x, 3, 94);
    $("placeY").value = clamp(place.y, 8, 90);
    $("placeStampable").checked = Boolean(place.stampable);
    updatePlaceQrPanel(place, preserveQrPreview);
    setText("placeFormTitle", place.name || id);
    setText("placeFormMode", place.active === false ? "사용자 지도에서 숨김" : "수정 중");
    $("placeRemoveBtn").hidden = place.active === false;
    $("placeRestoreBtn").hidden = place.active !== false;
    placeStatus("");
    if (rerender) {
      renderPlaceManager();
    } else {
      document.querySelectorAll("#adminPlacePins .admin-place-pin").forEach((pin) => pin.classList.toggle("selected", pin.dataset.placeId === id));
      document.querySelectorAll("#adminPlaceList .admin-place-item").forEach((item) => item.classList.toggle("selected", item.dataset.placeId === id));
    }
  }

  async function savePlace(event) {
    event.preventDefault();
    if (!isPlaceAdmin()) {
      placeStatus("Google 관리자 로그인 후 저장할 수 있습니다.", "err");
      return;
    }
    const id = selectedPlaceId || normalizePlaceId($("placeId").value);
    const name = $("placeName").value.trim();
    const stampable = $("placeStampable").checked;
    if (!id || !name) {
      placeStatus("장소 ID와 장소 이름을 입력해주세요.", "err");
      return;
    }
    const existing = placeById(id);
    const payload = {
      name,
      emoji: $("placeEmoji").value.trim() || "📍",
      markerType: $("placeMarkerType").value,
      category: $("placeCategory").value,
      hours: $("placeHours").value.trim(),
      summary: $("placeSummary").value.trim(),
      info: $("placeInfo").value.trim(),
      contact: $("placeContact").value.trim(),
      x: clamp($("placeX").value, 3, 94),
      y: clamp($("placeY").value, 8, 90),
      stampable,
      active: existing ? existing.active !== false : true,
      order: existing ? Number(existing.order || Date.now()) : Date.now(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (!existing) payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    $("placeSaveBtn").disabled = true;
    placeStatus("장소 정보를 저장하는 중입니다.");
    try {
      await placesCol.doc(id).set(payload, { merge: true });
      selectedPlaceId = id;
      placeStatus("저장했습니다. 참가자 지도에 실시간으로 반영됩니다.", "ok");
      if (stampable) await loadPlaceQr(false, id);
    } catch (error) {
      console.error(error);
      placeStatus("저장 실패: " + error.message, "err");
    } finally {
      $("placeSaveBtn").disabled = false;
    }
  }

  async function setPlaceActive(active) {
    if (!isPlaceAdmin() || !selectedPlaceId) {
      placeStatus("Google 관리자 로그인 후 변경할 수 있습니다.", "err");
      return;
    }
    const message = active ? "이 장소를 사용자 지도에 다시 표시할까요?" : "이 장소를 사용자 지도에서 제거할까요? 기존 스탬프 기록은 유지됩니다.";
    if (!window.confirm(message)) return;
    try {
      await placesCol.doc(selectedPlaceId).set({ active, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      placeStatus(active ? "사용자 지도에 다시 표시했습니다." : "사용자 지도에서 제거했습니다.", "ok");
    } catch (error) {
      console.error(error);
      placeStatus("변경 실패: " + error.message, "err");
    }
  }

  async function saveDraggedPlacePosition(id, x, y) {
    if (!isPlaceAdmin()) return;
    placeStatus("새 위치를 저장하는 중입니다.");
    try {
      await placesCol.doc(id).set({
        x,
        y,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      placeStatus("핀 위치를 저장했습니다. 참가자 지도에도 바로 반영됩니다.", "ok");
    } catch (error) {
      console.error(error);
      placeStatus("위치 저장 실패: " + error.message, "err");
    }
  }

  function subscribePlaces() {
    if (!has("adminPlacePins")) return;
    placesCol.onSnapshot((snapshot) => {
      latestPlaces = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderPlaceManager();
      if (selectedPlaceId && placeById(selectedPlaceId)) selectPlaceForEdit(selectedPlaceId, true);
    }, (error) => {
      console.error(error);
      placeStatus("장소 불러오기 실패: " + error.message, "err");
    });
  }

  function bindPlaceManager() {
    if (!has("placeForm")) return;
    subscribePlaces();
    resetPlaceForm();
    $("placeForm").addEventListener("submit", savePlace);
    $("placeNewBtn").addEventListener("click", resetPlaceForm);
    $("placeRemoveBtn").addEventListener("click", () => setPlaceActive(false));
    $("placeRestoreBtn").addEventListener("click", () => setPlaceActive(true));
    $("placeStampable").addEventListener("change", () => {
      if (!$("placeStampable").checked) {
        $("placeQrPanel").hidden = true;
      } else if (selectedPlaceId) {
        updatePlaceQrPanel({ ...placeById(selectedPlaceId), stampable: true });
      }
    });
    $("placeQrViewBtn").addEventListener("click", () => loadPlaceQr(false));
    $("placeQrRotateBtn").addEventListener("click", () => loadPlaceQr(true));
    $("placeQrDownloadBtn").addEventListener("click", downloadPlaceQr);
    $("placeQrPrintBtn").addEventListener("click", printPlaceQr);
    const adminMap = $("adminPlaceMap");
    adminMap.addEventListener("pointerdown", (event) => {
      const pin = event.target.closest("button[data-place-id]");
      if (!pin) return;
      if (!isPlaceAdmin()) {
        placeStatus("Google 관리자 로그인 후 핀을 이동할 수 있습니다.", "err");
        return;
      }
      event.preventDefault();
      const id = pin.dataset.placeId;
      if (selectedPlaceId !== id) selectPlaceForEdit(id, false, false);
      adminMap.setPointerCapture(event.pointerId);
      placeDrag = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
      adminMap.classList.add("is-dragging");
      adminMap.querySelector(`button[data-place-id="${id}"]`)?.classList.add("dragging");
    });
    window.addEventListener("pointermove", (event) => {
      if (!placeDrag || event.pointerId !== placeDrag.pointerId) return;
      const distance = Math.hypot(event.clientX - placeDrag.startX, event.clientY - placeDrag.startY);
      if (distance < 3 && !placeDrag.moved) return;
      placeDrag.moved = true;
      const rect = adminMap.getBoundingClientRect();
      const x = Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100, 3, 94));
      const y = Math.round(clamp(((event.clientY - rect.top) / rect.height) * 100, 8, 90));
      placeDrag.x = x;
      placeDrag.y = y;
      $("placeX").value = x;
      $("placeY").value = y;
      const movingPin = adminMap.querySelector(`button[data-place-id="${placeDrag.id}"]`);
      if (movingPin) {
        movingPin.style.left = `${x}%`;
        movingPin.style.top = `${y}%`;
      }
      setText("placePositionHint", `이동 위치: 가로 ${x}% · 세로 ${y}%`);
    });
    window.addEventListener("pointerup", async (event) => {
      if (!placeDrag || event.pointerId !== placeDrag.pointerId) return;
      const finishedDrag = placeDrag;
      placeDrag = null;
      adminMap.classList.remove("is-dragging");
      adminMap.querySelectorAll(".admin-place-pin.dragging").forEach((pin) => pin.classList.remove("dragging"));
      if (!finishedDrag.moved) return;
      const place = placeById(finishedDrag.id);
      if (place) {
        place.x = finishedDrag.x;
        place.y = finishedDrag.y;
      }
      await saveDraggedPlacePosition(finishedDrag.id, finishedDrag.x, finishedDrag.y);
    });
    window.addEventListener("pointercancel", (event) => {
      if (!placeDrag || event.pointerId !== placeDrag.pointerId) return;
      placeDrag = null;
      adminMap.classList.remove("is-dragging");
      adminMap.querySelectorAll(".admin-place-pin.dragging").forEach((pin) => pin.classList.remove("dragging"));
    });
    adminMap.addEventListener("click", (event) => {
      const pin = event.target.closest("button[data-place-id]");
      if (pin) {
        if (selectedPlaceId !== pin.dataset.placeId) selectPlaceForEdit(pin.dataset.placeId);
        return;
      }
      const rect = adminMap.getBoundingClientRect();
      $("placeX").value = Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100, 3, 94));
      $("placeY").value = Math.round(clamp(((event.clientY - rect.top) / rect.height) * 100, 8, 90));
      setText("placePositionHint", `선택 위치: 가로 ${$("placeX").value}% · 세로 ${$("placeY").value}%`);
    });
    $("adminPlaceList").addEventListener("click", (event) => {
      const item = event.target.closest("button[data-place-id]");
      if (item) selectPlaceForEdit(item.dataset.placeId);
    });
    $("placeLoginBtn").addEventListener("click", async () => {
      try { await auth.signInWithPopup(googleProvider); }
      catch (error) { placeStatus("로그인 실패: " + error.message, "err"); }
    });
    $("placeLogoutBtn").addEventListener("click", () => auth.signOut());
    auth.onAuthStateChanged((user) => {
      placeAdminUser = user;
      const admin = isPlaceAdmin();
      setText("placeAuthState", admin ? `${user.email} · 편집 가능` : user ? `${user.email} · 권한 없음` : "조회 전용");
      $("placeLoginBtn").hidden = Boolean(user);
      $("placeLogoutBtn").hidden = !user;
      $("placeSaveBtn").disabled = !admin;
      if (has("placeQrViewBtn")) $("placeQrViewBtn").disabled = !admin || !selectedPlaceId;
      if (has("placeQrRotateBtn")) $("placeQrRotateBtn").disabled = !admin || !selectedPlaceId || !placeById(selectedPlaceId)?.qrRequired;
      if (user && !admin) placeStatus(`${ADMIN_EMAIL} 계정으로 로그인해야 편집할 수 있습니다.`, "err");
    });
  }

  function setConnection(text) {
    setText("connectionText", text);
    setText("topConnectionText", text);
  }

  function formatTime(value) {
    if (!value) return "-";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function renderRows(snapshot) {
    const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    latestParticipants = docs;
    setText("totalText", `${docs.length}명`);
    setText("completedText", `${docs.filter((item) => item.completed).length}명`);
    setText("latestText", docs[0] ? (docs[0].participantCode || docs[0].id.slice(0, 8)) : "-");
    renderParticipantList();
    renderBoothPanels();
  }

  function getFilteredParticipants() {
    const query = participantQuery.trim().toLowerCase();
    return latestParticipants.filter((item) => {
      const stateMatches =
        participantFilter === "all" ||
        (participantFilter === "completed" && item.completed) ||
        (participantFilter === "active" && !item.completed);
      if (!stateMatches) return false;
      if (!query) return true;
      const target = [
        item.participantCode,
        item.uid,
        item.id,
      ].filter(Boolean).join(" ").toLowerCase();
      return target.includes(query);
    });
  }

  function renderParticipantList() {
    if (!has("participantList")) return;
    const rows = getFilteredParticipants();
    const total = latestParticipants.length;
    const completed = latestParticipants.filter((item) => item.completed).length;
    const active = total - completed;
    setText("participantSummary", `진행 ${active}명 · 완주 ${completed}명`);

    if (!latestParticipants.length) {
      setHTML("participantList", `<div class="empty">아직 참가자 문서가 없습니다. 참가자 앱에서 스탬프 투어를 시작하면 여기에 표시됩니다.</div>`);
      return;
    }
    setHTML("participantList", rows.length
      ? rows.map((item) => `
          <article class="participant-row">
            <div class="participant-main">
              <strong>${escapeHtml(item.participantCode || "발급 전")}</strong>
              <span class="time-text">최근 ${formatTime(item.lastSeenAt || item.createdAt)}</span>
            </div>
            <code>${escapeHtml(item.uid || item.id)}</code>
            <span class="stamp-chip">${item.stampCount || 0}개 스탬프</span>
            <span class="complete-chip ${item.completed ? "done" : ""}">${item.completed ? "완주" : "진행 중"}</span>
          </article>
        `).join("")
      : `<div class="empty">검색 조건에 맞는 참가자가 없습니다.</div>`);
  }

  // ===== 부스별 · 참가자별 이용 현황 =====
  let boothStatsUnsub = null;
  let latestStampDocs = []; // [{ uid, pointId, pointName, claimedAt }]

  function renderBoothPanels() {
    if (!has("boothCountList") && !has("participantBoothList")) return;
    const countByPoint = new Map(Object.keys(BOOTH_POINTS).map((id) => [id, 0]));
    const boothsByUid = new Map();
    latestStampDocs.forEach((stamp) => {
      countByPoint.set(stamp.pointId, (countByPoint.get(stamp.pointId) || 0) + 1);
      if (!boothsByUid.has(stamp.uid)) boothsByUid.set(stamp.uid, []);
      boothsByUid.get(stamp.uid).push(stamp);
    });

    const boothRows = Array.from(countByPoint.entries())
      .map(([pointId, count]) => ({ pointId, name: BOOTH_POINTS[pointId] || pointId, count }))
      .sort((a, b) => b.count - a.count);
    const maxCount = Math.max(1, ...boothRows.map((row) => row.count));

    setHTML("boothCountList", boothRows.map((row) => `
        <article class="booth-row">
          <strong>${escapeHtml(row.name)}</strong>
          <span class="stamp-chip">${row.count}명 이용</span>
          <div class="booth-meter" aria-hidden="true"><span style="width:${Math.max(4, Math.round((row.count / maxCount) * 100))}%"></span></div>
        </article>
      `).join(""));

    setHTML("participantBoothList", latestParticipants.length
      ? latestParticipants.map((item) => {
          const stamps = boothsByUid.get(item.uid || item.id) || [];
          const chips = stamps.length
            ? stamps.map((s) => `<span class="stamp-chip">${escapeHtml(BOOTH_POINTS[s.pointId] || s.pointName || s.pointId)}</span>`).join("")
            : `<span class="time-text">이용한 부스 없음</span>`;
          return `
            <article class="participant-row" style="grid-template-columns: 130px minmax(0,1fr);">
              <strong>${escapeHtml(item.participantCode || "발급 전")}</strong>
              <span class="booth-chips">${chips}</span>
            </article>
          `;
        }).join("")
      : `<div class="empty">아직 참가자 문서가 없습니다.</div>`);
  }

  function subscribeBoothStats() {
    if (!has("boothCountList") && !has("participantBoothList")) return;
    if (boothStatsUnsub) boothStatsUnsub();
    setText("boothStatsState", "실시간 수신 중");
    boothStatsUnsub = db.collectionGroup("stamps").onSnapshot(
      (snapshot) => {
        latestStampDocs = snapshot.docs
          .filter((doc) => doc.ref.path.startsWith(`events/${EVENT_ID}/participants/`))
          .map((doc) => ({
          uid: doc.ref.parent.parent.id,
          pointId: doc.data().pointId,
          pointName: doc.data().pointName,
          claimedAt: doc.data().claimedAt,
          }));
        renderBoothPanels();
      },
      (error) => {
        console.error(error);
        setText("boothStatsState", "오류");
        setHTML("boothCountList", `<div class="empty">${error.message}</div>`);
        setHTML("participantBoothList", "");
      },
    );
  }

  function subscribeParticipants() {
    if (unsubscribe) unsubscribe();
    setConnection("실시간 수신 중");
    unsubscribe = db.collection("events")
      .doc(EVENT_ID)
      .collection("participants")
      .orderBy("lastSeenAt", "desc")
      .limit(200)
      .onSnapshot(renderRows, (error) => {
        console.error(error);
        setConnection("권한 또는 인덱스 오류");
        setHTML("participantList", `<div class="empty">${error.message}</div>`);
      });
  }

  // ===== 실시간 알림 방송 (여러 건 관리) =====
  const NOTICE_LABEL = { urgent: "긴급 공지", info: "안내", safety: "안전 안내" };
  const broadcastCol = db.collection("events").doc(EVENT_ID).collection("broadcast");
  let noticeUnsub = null;
  let editingId = null;
  let latestNotices = [];

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function bcStatus(message, kind) {
    const el = $("bcStatus");
    if (!el) return;
    el.textContent = message || "";
    el.className = "bc-status" + (kind ? " " + kind : "");
  }

  function badgeClass(type) {
    return "bc-badge" + (type && type !== "urgent" ? " " + type : "");
  }

  function resetForm() {
    if (!has("bcType")) return;
    editingId = null;
    $("bcType").value = "urgent";
    $("bcTitle").value = "";
    $("bcBody").value = "";
    $("bcSubmitBtn").textContent = "새 공지 발송";
    $("bcResetBtn").hidden = true;
    bcStatus("");
  }

  function startEdit(id) {
    const notice = latestNotices.find((n) => n.id === id);
    if (!notice) return;
    editingId = id;
    $("bcType").value = notice.type || "urgent";
    $("bcTitle").value = notice.title || "";
    $("bcBody").value = notice.body || "";
    $("bcSubmitBtn").textContent = "수정 저장";
    $("bcResetBtn").hidden = false;
    bcStatus("공지를 수정하는 중입니다. 저장하면 바로 반영됩니다.");
    $("bcTitle").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderList(docs) {
    if (!has("bcList")) return;
    latestNotices = docs;
    const activeCount = docs.filter((n) => n.active).length;
    setText("broadcastState", docs.length
      ? `활성 ${activeCount}건 · 총 ${docs.length}건`
      : "등록된 공지 없음");

    setHTML("bcList", docs.length
      ? docs.map((n) => `
          <article class="bc-row ${n.active ? "" : "inactive"}">
            <div class="bc-row-top">
              <span class="${badgeClass(n.type)}">${NOTICE_LABEL[n.type] || NOTICE_LABEL.urgent}</span>
              <strong>${escapeHtml(n.title)}</strong>
              <span class="bc-row-status ${n.active ? "on" : ""}">${n.active ? "송출 중" : "비활성"}</span>
            </div>
            <p class="bc-row-body">${escapeHtml(n.body || "")}</p>
            <div class="bc-row-meta">${formatTime(n.updatedAt || n.createdAt)} 업데이트</div>
            <div class="bc-row-actions">
              <button class="bc-mini-btn" type="button" data-action="toggle" data-id="${n.id}">${n.active ? "비활성화" : "활성화"}</button>
              <button class="bc-mini-btn" type="button" data-action="edit" data-id="${n.id}">수정</button>
              <button class="bc-mini-btn danger" type="button" data-action="delete" data-id="${n.id}">삭제</button>
            </div>
          </article>
        `).join("")
      : `<div class="empty">아직 만든 공지가 없습니다.</div>`);
  }

  function subscribeNotices() {
    if (!has("bcList")) return;
    if (noticeUnsub) noticeUnsub();
    noticeUnsub = broadcastCol.orderBy("createdAt", "desc").onSnapshot(
      (snap) => renderList(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
      (error) => { console.error(error); bcStatus(error.message, "err"); },
    );
  }

  async function submitNotice() {
    const title = $("bcTitle").value.trim();
    if (!title) { bcStatus("제목을 입력해 주세요.", "err"); $("bcTitle").focus(); return; }
    const payload = {
      type: $("bcType").value,
      title,
      body: $("bcBody").value.trim(),
      active: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    $("bcSubmitBtn").disabled = true;
    bcStatus(editingId ? "수정 저장 중…" : "발송 중…");
    try {
      if (editingId) {
        await broadcastCol.doc(editingId).set(payload, { merge: true });
        bcStatus("수정 내용을 저장했습니다.", "ok");
      } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await broadcastCol.add(payload);
        bcStatus("새 공지를 발송했습니다.", "ok");
      }
      resetForm();
    } catch (error) {
      console.error(error);
      bcStatus("저장 실패: " + error.message, "err");
    } finally {
      $("bcSubmitBtn").disabled = false;
    }
  }

  async function toggleNotice(id) {
    const notice = latestNotices.find((n) => n.id === id);
    if (!notice) return;
    try {
      await broadcastCol.doc(id).set(
        { active: !notice.active, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch (error) {
      console.error(error);
      bcStatus("상태 변경 실패: " + error.message, "err");
    }
  }

  async function deleteNotice(id) {
    if (!window.confirm("이 공지를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await broadcastCol.doc(id).delete();
      if (editingId === id) resetForm();
    } catch (error) {
      console.error(error);
      bcStatus("삭제 실패: " + error.message, "err");
    }
  }

  // ===== 행사 일정 관리 (상태는 입력한 시간으로 자동 판정) =====
  const STATUS_LABEL = { next: "예정", now: "진행 중", done: "완료" };
  const scheduleCol = db.collection("events").doc(EVENT_ID).collection("schedule");
  const scheduleSettingsRef = db.collection("events").doc(EVENT_ID).collection("settings").doc("schedule");
  let scheduleUnsub = null;
  let scheduleSettingsUnsub = null;
  let scheduleTickTimer = null;
  let editingScheduleId = null;
  let latestSchedule = [];
  let scheduleDayFilter = 1;
  let activeScheduleDay = 1;

  function computeScheduleStatus(dateStr, timeStr, endStr) {
    const start = new Date(`${dateStr}T${timeStr}:00`);
    const end = new Date(`${dateStr}T${endStr}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "next";
    if (end <= start) end.setDate(end.getDate() + 1); // 자정을 넘기는 일정 보정
    const now = new Date();
    if (now < start) return "next";
    if (now > end) return "done";
    return "now";
  }

  function schMsg(message, kind) {
    const el = $("schMsg");
    if (!el) return;
    el.textContent = message || "";
    el.className = "bc-status" + (kind ? " " + kind : "");
  }

  function isValidTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function maskTimeInput(raw) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    return digits.length >= 2 ? digits.slice(0, 2) + ":" + digits.slice(2) : digits;
  }

  function todayLocalDate() {
    const d = new Date();
    return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function resetScheduleForm() {
    if (!has("schDate")) return;
    editingScheduleId = null;
    $("schDay").value = String(scheduleDayFilter);
    $("schDate").value = todayLocalDate();
    $("schTime").value = "";
    $("schEnd").value = "";
    $("schPlace").value = "메인 무대";
    $("schTitle").value = "";
    $("schDesc").value = "";
    $("schPublished").checked = false;
    $("schSubmitBtn").textContent = "일정 저장";
    $("schResetBtn").hidden = true;
    schMsg("");
  }

  function startEditSchedule(id) {
    const item = latestSchedule.find((s) => s.id === id);
    if (!item) return;
    editingScheduleId = id;
    setScheduleDay(Number(item.day || 1), false);
    $("schDay").value = String(Number(item.day || 1));
    $("schDate").value = item.date || todayLocalDate();
    $("schTime").value = item.time || "";
    $("schEnd").value = item.end || "";
    $("schPlace").value = item.place || "";
    $("schTitle").value = item.title || "";
    $("schDesc").value = item.desc || "";
    $("schPublished").checked = item.published !== false;
    $("schSubmitBtn").textContent = "수정 저장";
    $("schResetBtn").hidden = false;
    schMsg("일정을 수정하는 중입니다. 저장하면 바로 반영됩니다.");
    $("schTitle").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setScheduleDay(day, reset = true) {
    scheduleDayFilter = Math.max(1, Math.min(3, Number(day) || 1));
    document.querySelectorAll("#scheduleDayToolbar button").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.day) === scheduleDayFilter);
    });
    setText("scheduleListTitle", `${scheduleDayFilter}일차 일정 목록`);
    setText("schPublishDayBtn", scheduleDayFilter === activeScheduleDay
      ? `${scheduleDayFilter}일차 현재 배포 중`
      : `${scheduleDayFilter}일차 사용자 화면에 배포`);
    if (has("schDay")) $("schDay").value = String(scheduleDayFilter);
    renderSchedule();
    if (reset) resetScheduleForm();
  }

  function renderSchedule(docs) {
    if (!has("schList")) return;
    if (docs) latestSchedule = docs;
    const rows = latestSchedule.filter((item) => Number(item.day || 1) === scheduleDayFilter);
    const publishedCount = rows.filter((item) => item.published !== false).length;
    setText("scheduleState", rows.length ? `${scheduleDayFilter}일차 ${rows.length}건 · 공개 ${publishedCount}건` : `${scheduleDayFilter}일차 일정 없음`);

    setHTML("schList", rows.length
      ? rows.map((s) => {
          const status = computeScheduleStatus(s.date, s.time, s.end);
          return `
          <article class="bc-row">
            <div class="bc-row-top">
              <span class="sch-status ${status}">${STATUS_LABEL[status]}</span>
              <span class="schedule-publish-state ${s.published !== false ? "on" : ""}">${s.published !== false ? "공개" : "작성 중"}</span>
              <strong>${escapeHtml(s.title)}</strong>
            </div>
            <div class="bc-row-meta">${escapeHtml(s.date || "")} · ${escapeHtml(s.time)} ~ ${escapeHtml(s.end)} · ${escapeHtml(s.place || "")}</div>
            <p class="bc-row-body">${escapeHtml(s.desc || "")}</p>
            <div class="bc-row-actions">
              <button class="bc-mini-btn" type="button" data-action="publish" data-id="${s.id}">${s.published !== false ? "공개 내리기" : "지금 공개"}</button>
              <button class="bc-mini-btn" type="button" data-action="edit" data-id="${s.id}">수정</button>
              <button class="bc-mini-btn danger" type="button" data-action="delete" data-id="${s.id}">삭제</button>
            </div>
          </article>
        `;
        }).join("")
      : `<div class="empty">아직 등록된 일정이 없습니다.</div>`);
  }

  function scheduleSortKey(s) {
    return `${s.date || ""}${s.time || ""}`;
  }

  function subscribeSchedule() {
    if (!has("schList")) return;
    if (scheduleUnsub) scheduleUnsub();
    scheduleUnsub = scheduleCol.onSnapshot(
      (snap) => {
        const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        docs.sort((a, b) => scheduleSortKey(a).localeCompare(scheduleSortKey(b)));
        renderSchedule(docs);
      },
      (error) => { console.error(error); schMsg(error.message, "err"); },
    );
  }

  async function submitSchedule() {
    const wasEditing = Boolean(editingScheduleId);
    const day = Number($("schDay").value || scheduleDayFilter);
    const date = $("schDate").value;
    const time = $("schTime").value.trim();
    const end = $("schEnd").value.trim();
    const title = $("schTitle").value.trim();
    if (!date) { schMsg("날짜를 선택해 주세요.", "err"); $("schDate").focus(); return; }
    if (!isValidTime(time) || !isValidTime(end)) {
      schMsg("시간은 HH:MM 형식으로 입력해 주세요. 예: 18:00", "err");
      $("schTime").focus();
      return;
    }
    if (!title) { schMsg("제목을 입력해 주세요.", "err"); $("schTitle").focus(); return; }
    const payload = {
      day,
      date,
      time,
      end,
      place: $("schPlace").value.trim() || "메인 무대",
      title,
      desc: $("schDesc").value.trim(),
      published: $("schPublished").checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    $("schSubmitBtn").disabled = true;
    schMsg(editingScheduleId ? "수정 저장 중…" : "추가 중…");
    try {
      if (editingScheduleId) {
        await scheduleCol.doc(editingScheduleId).set(payload, { merge: true });
      } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await scheduleCol.add(payload);
      }
      resetScheduleForm();
      schMsg(payload.published
        ? `${wasEditing ? "수정 내용을" : "새 일정을"} 저장하고 공개했습니다.`
        : `${wasEditing ? "수정 내용을" : "새 일정을"} 임시 저장했습니다.`, "ok");
    } catch (error) {
      console.error(error);
      schMsg("저장 실패: " + error.message, "err");
    } finally {
      $("schSubmitBtn").disabled = false;
    }
  }

  async function deleteSchedule(id) {
    if (!window.confirm("이 일정을 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await scheduleCol.doc(id).delete();
      if (editingScheduleId === id) resetScheduleForm();
    } catch (error) {
      console.error(error);
      schMsg("삭제 실패: " + error.message, "err");
    }
  }

  function subscribeScheduleSettings() {
    if (!has("scheduleActiveDayState")) return;
    if (scheduleSettingsUnsub) scheduleSettingsUnsub();
    scheduleSettingsUnsub = scheduleSettingsRef.onSnapshot((doc) => {
      activeScheduleDay = Math.max(1, Math.min(3, Number(doc.exists ? doc.data().activeDay : 1) || 1));
      setText("scheduleActiveDayState", `현재 사용자 화면에는 ${activeScheduleDay}일차 일정이 표시됩니다.`);
      setScheduleDay(scheduleDayFilter, false);
    }, (error) => {
      console.error(error);
      setText("scheduleActiveDayState", "현재 배포 일차를 불러오지 못했습니다.");
    });
  }

  async function toggleSchedulePublished(id) {
    const item = latestSchedule.find((schedule) => schedule.id === id);
    if (!item) return;
    const published = item.published === false;
    try {
      await scheduleCol.doc(id).set({ published, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      schMsg(published ? "일정을 사용자 앱에 공개했습니다." : "일정을 사용자 앱에서 내렸습니다.", "ok");
    } catch (error) {
      console.error(error);
      schMsg("공개 상태 변경 실패: " + error.message, "err");
    }
  }

  async function publishSelectedScheduleDay() {
    const rows = latestSchedule.filter((item) => Number(item.day || 1) === scheduleDayFilter && item.published === false);
    const message = rows.length
      ? `${scheduleDayFilter}일차 작성 중 일정 ${rows.length}건을 공개하고 사용자 화면을 이 일차로 전환할까요?`
      : `사용자 화면을 ${scheduleDayFilter}일차 일정으로 전환할까요?`;
    if (!window.confirm(message)) return;
    const batch = db.batch();
    rows.forEach((item) => batch.set(scheduleCol.doc(item.id), {
      published: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }));
    batch.set(scheduleSettingsRef, {
      activeDay: scheduleDayFilter,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    try {
      await batch.commit();
      schMsg(`${scheduleDayFilter}일차 일정을 사용자 화면에 배포했습니다.`, "ok");
    } catch (error) {
      console.error(error);
      schMsg("일차 공개 실패: " + error.message, "err");
    }
  }

  function activateCurrentNav() {
    const page = document.body.dataset.page || "overview";
    document.querySelectorAll(".nav-btn").forEach((link) => {
      link.classList.toggle("active", link.dataset.page === page);
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    activateCurrentNav();
    bindPlaceManager();
    subscribeParticipants();
    subscribeBoothStats();
    if (has("participantSearch")) {
      $("participantSearch").addEventListener("input", (event) => {
        participantQuery = event.target.value;
        renderParticipantList();
      });
    }
    if (has("participantFilter")) {
      $("participantFilter").addEventListener("change", (event) => {
        participantFilter = event.target.value;
        renderParticipantList();
      });
    }

    subscribeNotices();
    if (has("bcSubmitBtn")) $("bcSubmitBtn").addEventListener("click", submitNotice);
    if (has("bcResetBtn")) $("bcResetBtn").addEventListener("click", resetForm);
    if (has("bcList")) {
      $("bcList").addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === "toggle") toggleNotice(id);
        else if (btn.dataset.action === "edit") startEdit(id);
        else if (btn.dataset.action === "delete") deleteNotice(id);
      });
    }

    resetScheduleForm();
    subscribeSchedule();
    subscribeScheduleSettings();
    if (scheduleTickTimer) clearInterval(scheduleTickTimer);
    if (has("schList")) {
      scheduleTickTimer = setInterval(() => renderSchedule(), 30000); // 시간 경과에 따라 상태 배지 자동 갱신
    }
    [$("schTime"), $("schEnd")].filter(Boolean).forEach((input) => {
      input.addEventListener("input", (event) => {
        if (event.inputType && event.inputType.startsWith("delete")) return; // 백스페이스로 지울 때는 콜론을 다시 채우지 않음
        input.value = maskTimeInput(input.value);
      });
    });
    if (has("schSubmitBtn")) $("schSubmitBtn").addEventListener("click", submitSchedule);
    if (has("schResetBtn")) $("schResetBtn").addEventListener("click", resetScheduleForm);
    if (has("schPublishDayBtn")) $("schPublishDayBtn").addEventListener("click", publishSelectedScheduleDay);
    if (has("scheduleDayToolbar")) {
      $("scheduleDayToolbar").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-day]");
        if (button) setScheduleDay(Number(button.dataset.day));
      });
    }
    if (has("schDay")) $("schDay").addEventListener("change", (event) => setScheduleDay(Number(event.target.value), false));
    if (has("schList")) {
      $("schList").addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === "publish") toggleSchedulePublished(id);
        else if (btn.dataset.action === "edit") startEditSchedule(id);
        else if (btn.dataset.action === "delete") deleteSchedule(id);
      });
    }
  });
})();
