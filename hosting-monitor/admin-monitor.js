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

  const auth = firebase.auth();
  const db = firebase.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();
  const $ = (id) => document.getElementById(id);
  let unsubscribe = null;

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

  auth.onAuthStateChanged((user) => {
    $("loginBtn").hidden = Boolean(user);
    $("logoutBtn").hidden = !user;
    $("adminEmail").textContent = user?.email || "관리자 미확인";
    if (!user) {
      setConnection("로그인이 필요합니다");
      if (unsubscribe) unsubscribe();
      $("participantList").innerHTML = `<div class="empty">Google 로그인 후 참가자 목록을 불러옵니다.</div>`;
      return;
    }
    subscribeParticipants();
  });

  window.addEventListener("DOMContentLoaded", () => {
    $("loginBtn").addEventListener("click", () => auth.signInWithPopup(provider));
    $("logoutBtn").addEventListener("click", () => auth.signOut());
  });
})();
