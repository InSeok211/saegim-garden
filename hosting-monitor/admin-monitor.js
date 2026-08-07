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
  const $ = (id) => document.getElementById(id);
  let unsubscribe = null;
  let latestParticipants = [];

  // 부스 목록 — functions/index.js STAMP_POINTS와 동일하게 유지
  const BOOTH_POINTS = {
    food1: "바다어묵",
    shop1: "다대포 기념공방",
    food2: "바다 간식 부스",
    experience1: "해변 공예 체험",
    info: "운영 안내소",
  };

  function setConnection(text) {
    $("connectionText").textContent = text;
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
    $("totalText").textContent = `${docs.length}명`;
    $("completedText").textContent = `${docs.filter((item) => item.completed).length}명`;
    $("latestText").textContent = docs[0] ? (docs[0].participantCode || docs[0].id.slice(0, 8)) : "-";

    $("participantList").innerHTML = docs.length
      ? docs.map((item) => `
          <article class="participant-row">
            <strong>${item.participantCode || "발급 전"}</strong>
            <code>${item.uid || item.id}</code>
            <span class="stamp-chip">${item.stampCount || 0}개 스탬프</span>
            <span class="complete-chip ${item.completed ? "done" : ""}">${item.completed ? "완주" : "진행 중"}</span>
            <span class="time-text">최근 ${formatTime(item.lastSeenAt || item.createdAt)}</span>
          </article>
        `).join("")
      : `<div class="empty">아직 참가자 문서가 없습니다. 참가자 앱에서 스탬프 투어를 시작하면 여기에 표시됩니다.</div>`;
    renderBoothPanels();
  }

  // ===== 부스별 · 참가자별 이용 현황 =====
  let boothStatsUnsub = null;
  let latestStampDocs = []; // [{ uid, pointId, pointName, claimedAt }]

  function renderBoothPanels() {
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

    $("boothCountList").innerHTML = boothRows.map((row) => `
        <article class="participant-row" style="grid-template-columns: minmax(0,1fr) 120px;">
          <strong>${escapeHtml(row.name)}</strong>
          <span class="stamp-chip">${row.count}명 이용</span>
        </article>
      `).join("");

    $("participantBoothList").innerHTML = latestParticipants.length
      ? latestParticipants.map((item) => {
          const stamps = boothsByUid.get(item.uid || item.id) || [];
          const chips = stamps.length
            ? stamps.map((s) => `<span class="stamp-chip">${escapeHtml(BOOTH_POINTS[s.pointId] || s.pointName || s.pointId)}</span>`).join("")
            : `<span class="time-text">이용한 부스 없음</span>`;
          return `
            <article class="participant-row" style="grid-template-columns: 130px minmax(0,1fr);">
              <strong>${item.participantCode || "발급 전"}</strong>
              <span style="display:flex;gap:6px;flex-wrap:wrap;">${chips}</span>
            </article>
          `;
        }).join("")
      : `<div class="empty">아직 참가자 문서가 없습니다.</div>`;
  }

  function subscribeBoothStats() {
    if (boothStatsUnsub) boothStatsUnsub();
    $("boothStatsState").textContent = "실시간 수신 중";
    boothStatsUnsub = db.collectionGroup("stamps").onSnapshot(
      (snapshot) => {
        latestStampDocs = snapshot.docs.map((doc) => ({
          uid: doc.ref.parent.parent.id,
          pointId: doc.data().pointId,
          pointName: doc.data().pointName,
          claimedAt: doc.data().claimedAt,
        }));
        renderBoothPanels();
      },
      (error) => {
        console.error(error);
        $("boothStatsState").textContent = "오류";
        $("boothCountList").innerHTML = `<div class="empty">${error.message}</div>`;
        $("participantBoothList").innerHTML = "";
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
        $("participantList").innerHTML = `<div class="empty">${error.message}</div>`;
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
    el.textContent = message || "";
    el.className = "bc-status" + (kind ? " " + kind : "");
  }

  function badgeClass(type) {
    return "bc-badge" + (type && type !== "urgent" ? " " + type : "");
  }

  function resetForm() {
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
    latestNotices = docs;
    const activeCount = docs.filter((n) => n.active).length;
    $("broadcastState").textContent = docs.length
      ? `활성 ${activeCount}건 · 총 ${docs.length}건`
      : "등록된 공지 없음";

    $("bcList").innerHTML = docs.length
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
      : `<div class="empty">아직 만든 공지가 없습니다.</div>`;
  }

  function subscribeNotices() {
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
  let scheduleUnsub = null;
  let scheduleTickTimer = null;
  let editingScheduleId = null;
  let latestSchedule = [];

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
    editingScheduleId = null;
    $("schDate").value = todayLocalDate();
    $("schTime").value = "";
    $("schEnd").value = "";
    $("schPlace").value = "메인 무대";
    $("schTitle").value = "";
    $("schDesc").value = "";
    $("schSubmitBtn").textContent = "일정 추가";
    $("schResetBtn").hidden = true;
    schMsg("");
  }

  function startEditSchedule(id) {
    const item = latestSchedule.find((s) => s.id === id);
    if (!item) return;
    editingScheduleId = id;
    $("schDate").value = item.date || todayLocalDate();
    $("schTime").value = item.time || "";
    $("schEnd").value = item.end || "";
    $("schPlace").value = item.place || "";
    $("schTitle").value = item.title || "";
    $("schDesc").value = item.desc || "";
    $("schSubmitBtn").textContent = "수정 저장";
    $("schResetBtn").hidden = false;
    schMsg("일정을 수정하는 중입니다. 저장하면 바로 반영됩니다.");
    $("schTitle").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderSchedule(docs) {
    if (docs) latestSchedule = docs;
    const rows = latestSchedule;
    $("scheduleState").textContent = rows.length ? `등록 ${rows.length}건` : "등록된 일정 없음";

    $("schList").innerHTML = rows.length
      ? rows.map((s) => {
          const status = computeScheduleStatus(s.date, s.time, s.end);
          return `
          <article class="bc-row">
            <div class="bc-row-top">
              <span class="sch-status ${status}">${STATUS_LABEL[status]}</span>
              <strong>${escapeHtml(s.title)}</strong>
            </div>
            <div class="bc-row-meta">${escapeHtml(s.date || "")} · ${escapeHtml(s.time)} ~ ${escapeHtml(s.end)} · ${escapeHtml(s.place || "")}</div>
            <p class="bc-row-body">${escapeHtml(s.desc || "")}</p>
            <div class="bc-row-actions">
              <button class="bc-mini-btn" type="button" data-action="edit" data-id="${s.id}">수정</button>
              <button class="bc-mini-btn danger" type="button" data-action="delete" data-id="${s.id}">삭제</button>
            </div>
          </article>
        `;
        }).join("")
      : `<div class="empty">아직 등록된 일정이 없습니다.</div>`;
  }

  function scheduleSortKey(s) {
    return `${s.date || ""}${s.time || ""}`;
  }

  function subscribeSchedule() {
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
      date,
      time,
      end,
      place: $("schPlace").value.trim() || "메인 무대",
      title,
      desc: $("schDesc").value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    $("schSubmitBtn").disabled = true;
    schMsg(editingScheduleId ? "수정 저장 중…" : "추가 중…");
    try {
      if (editingScheduleId) {
        await scheduleCol.doc(editingScheduleId).set(payload, { merge: true });
        schMsg("수정 내용을 저장했습니다.", "ok");
      } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await scheduleCol.add(payload);
        schMsg("새 일정을 추가했습니다.", "ok");
      }
      resetScheduleForm();
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

  window.addEventListener("DOMContentLoaded", () => {
    subscribeParticipants();
    subscribeNotices();
    subscribeBoothStats();
    $("bcSubmitBtn").addEventListener("click", submitNotice);
    $("bcResetBtn").addEventListener("click", resetForm);
    $("bcList").addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "toggle") toggleNotice(id);
      else if (btn.dataset.action === "edit") startEdit(id);
      else if (btn.dataset.action === "delete") deleteNotice(id);
    });

    resetScheduleForm();
    subscribeSchedule();
    if (scheduleTickTimer) clearInterval(scheduleTickTimer);
    scheduleTickTimer = setInterval(() => renderSchedule(), 30000); // 시간 경과에 따라 상태 배지 자동 갱신
    [$("schTime"), $("schEnd")].forEach((input) => {
      input.addEventListener("input", (event) => {
        if (event.inputType && event.inputType.startsWith("delete")) return; // 백스페이스로 지울 때는 콜론을 다시 채우지 않음
        input.value = maskTimeInput(input.value);
      });
    });
    $("schSubmitBtn").addEventListener("click", submitSchedule);
    $("schResetBtn").addEventListener("click", resetScheduleForm);
    $("schList").addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit") startEditSchedule(id);
      else if (btn.dataset.action === "delete") deleteSchedule(id);
    });
  });
})();
