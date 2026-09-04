"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
setGlobalOptions({ region: "asia-northeast3", maxInstances: 20, invoker: "public" });

const db = admin.firestore();
const EVENT_ID = "dadaepo-beer-2026";
const COUNTER_ID = EVENT_ID;
const CODE_PREFIX = "A";
const CODE_DIGITS = 5;
const REQUIRED_STAMPS = 5;
const ADMIN_EMAILS = new Set(["rjbcom4263@gmail.com"]);
const STAMP_POINTS = {
  food1: { code: "DADAE-001", name: "바다어묵" },
  shop1: { code: "DADAE-002", name: "다대포 기념공방" },
  food2: { code: "DADAE-003", name: "바다 간식 부스" },
  experience1: { code: "DADAE-004", name: "해변 공예 체험" },
  info: { code: "DADAE-005", name: "운영 안내소" },
};

function cleanRequestId(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

function participantCodeFromSeq(seq) {
  return `${CODE_PREFIX}${String(seq).padStart(CODE_DIGITS, "0")}`;
}

function isAdminRequest(request) {
  return Boolean(request.auth && ADMIN_EMAILS.has(String(request.auth.token.email || "").toLowerCase()));
}

function cleanPlaceId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
}

function tokensMatch(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function findStampPoint(eventId, data) {
  const rawCode = typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
  const rawPointId = typeof data.pointId === "string" ? data.pointId.trim() : "";
  const rawToken = typeof data.qrToken === "string" ? data.qrToken.trim() : "";
  const placesRef = db.collection("events").doc(eventId).collection("places");

  if (rawToken) {
    if (!rawPointId) return null;
    const [placeSnap, secretSnap] = await Promise.all([
      placesRef.doc(rawPointId).get(),
      db.collection("events").doc(eventId).collection("placeSecrets").doc(rawPointId).get(),
    ]);
    if (!placeSnap.exists || !secretSnap.exists) return null;
    const place = placeSnap.data() || {};
    const secret = secretSnap.data() || {};
    if (place.active === false || place.stampable !== true || secret.active === false) return null;
    if (!tokensMatch(rawToken, secret.token)) return null;
    return { pointId: placeSnap.id, code: place.code || "SECURE-QR", name: place.name || placeSnap.id };
  }

  if (rawPointId) {
    const placeSnap = await placesRef.doc(rawPointId).get();
    if (placeSnap.exists) {
      const place = placeSnap.data() || {};
      if (place.active === false || place.stampable !== true || place.qrRequired === true || !place.code) return null;
      if (rawCode && String(place.code).toUpperCase() !== rawCode) return null;
      return { pointId: placeSnap.id, code: String(place.code).toUpperCase(), name: place.name || placeSnap.id };
    }
  }

  if (rawCode) {
    const codeSnap = await placesRef.where("code", "==", rawCode).limit(1).get();
    if (!codeSnap.empty) {
      const doc = codeSnap.docs[0];
      const place = doc.data() || {};
      if (place.active === false || place.stampable !== true || place.qrRequired === true) return null;
      return { pointId: doc.id, code: rawCode, name: place.name || doc.id };
    }
  }

  // Firestore 장소를 처음 등록하기 전까지 기존 QR 5개는 계속 동작합니다.
  const anyPlace = await placesRef.limit(1).get();
  if (!anyPlace.empty) return null;
  if (rawPointId && STAMP_POINTS[rawPointId]) return { pointId: rawPointId, ...STAMP_POINTS[rawPointId] };
  return Object.entries(STAMP_POINTS)
    .map(([pointId, point]) => ({ pointId, ...point }))
    .find((point) => point.code === rawCode);
}

exports.managePlaceQr = onCall(async (request) => {
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }

  const eventId = String(request.data && request.data.eventId ? request.data.eventId : EVENT_ID);
  const placeId = cleanPlaceId(request.data && request.data.placeId);
  const action = String(request.data && request.data.action ? request.data.action : "get");
  if (eventId !== EVENT_ID || !placeId) {
    throw new HttpsError("invalid-argument", "A valid eventId and placeId are required.");
  }
  if (!new Set(["get", "rotate", "delete"]).has(action)) {
    throw new HttpsError("invalid-argument", "Unsupported QR action.");
  }

  const eventRef = db.collection("events").doc(eventId);
  const placeRef = eventRef.collection("places").doc(placeId);
  const secretRef = eventRef.collection("placeSecrets").doc(placeId);
  const [placeSnap, secretSnap] = await Promise.all([placeRef.get(), secretRef.get()]);
  if (!placeSnap.exists) {
    throw new HttpsError("not-found", "Place not found.");
  }
  if (action === "delete") {
    const batch = db.batch();
    batch.delete(placeRef);
    batch.delete(secretRef);
    await batch.commit();
    return { eventId, placeId, deleted: true };
  }
  const place = placeSnap.data() || {};
  if (place.active === false || place.stampable !== true) {
    throw new HttpsError("failed-precondition", "Only active stamp places can issue QR codes.");
  }

  const currentSecret = secretSnap.exists ? secretSnap.data() || {} : {};
  const shouldRotate = action === "rotate" || !currentSecret.token;
  const token = shouldRotate ? crypto.randomBytes(24).toString("base64url") : currentSecret.token;
  const version = shouldRotate ? Number(currentSecret.version || 0) + 1 : Number(currentSecret.version || 1);
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (shouldRotate) {
    await secretRef.set({
      token,
      version,
      active: true,
      eventId,
      placeId,
      updatedAt: now,
      generatedBy: request.auth.uid,
    }, { merge: true });
  }
  await placeRef.set({
    qrRequired: true,
    qrVersion: version,
    qrUpdatedAt: now,
  }, { merge: true });

  const qrPayload = `https://dadaepo-festival.web.app/?point=${encodeURIComponent(placeId)}&token=${encodeURIComponent(token)}`;
  return {
    eventId,
    placeId,
    placeName: place.name || placeId,
    version,
    qrPayload,
    rotated: shouldRotate,
  };
});

exports.registerParticipant = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Firebase anonymous auth is required.");
  }

  const uid = request.auth.uid;
  const eventId = String(request.data && request.data.eventId ? request.data.eventId : EVENT_ID);
  const requestId = cleanRequestId(request.data && request.data.requestId);

  if (eventId !== EVENT_ID) {
    throw new HttpsError("invalid-argument", "Unsupported eventId.");
  }
  if (!requestId) {
    throw new HttpsError("invalid-argument", "requestId is required.");
  }

  const participantRef = db.collection("events").doc(eventId).collection("participants").doc(uid);
  const counterRef = db.collection("systemCounters").doc(COUNTER_ID);
  const idempotencyRef = db.collection("idempotency").doc(`register_${eventId}_${requestId}`);
  const now = admin.firestore.FieldValue.serverTimestamp();

  return db.runTransaction(async (tx) => {
    const [participantSnap, idempotencySnap, counterSnap] = await Promise.all([
      tx.get(participantRef),
      tx.get(idempotencyRef),
      tx.get(counterRef),
    ]);

    if (participantSnap.exists) {
      const existing = participantSnap.data() || {};
      const participantCode = existing.participantCode;
      if (!participantCode) {
        throw new HttpsError("internal", "Participant exists without a code.");
      }
      tx.set(participantRef, { lastSeenAt: now, lastRequestId: requestId }, { merge: true });
      tx.set(
        idempotencyRef,
        { eventId, uid, participantCode, status: "existing", updatedAt: now },
        { merge: true },
      );
      return { eventId, uid, participantCode, existing: true };
    }

    if (idempotencySnap.exists) {
      const previous = idempotencySnap.data() || {};
      if (previous.uid === uid && previous.participantCode) {
        return { eventId, uid, participantCode: previous.participantCode, existing: true };
      }
      throw new HttpsError("already-exists", "This requestId was already used.");
    }

    const currentSeq = counterSnap.exists ? Number(counterSnap.data().participantSeq || 0) : 0;
    const nextSeq = currentSeq + 1;
    if (nextSeq > 99999) {
      throw new HttpsError("resource-exhausted", "Participant code range is full.");
    }

    const participantCode = participantCodeFromSeq(nextSeq);
    const participantData = {
      uid,
      participantCode,
      participantSeq: nextSeq,
      participantCodeStatus: "issued-server-transaction",
      eventId,
      stampCount: 0,
      completed: false,
      rewardIssued: false,
      rewardRedeemed: false,
      createdAt: now,
      lastSeenAt: now,
      lastRequestId: requestId,
      schemaVersion: 2,
    };

    tx.set(participantRef, participantData);
    tx.set(
      counterRef,
      {
        eventId,
        participantSeq: nextSeq,
        updatedAt: now,
      },
      { merge: true },
    );
    tx.set(idempotencyRef, {
      eventId,
      uid,
      participantCode,
      status: "created",
      createdAt: now,
      updatedAt: now,
    });

    return { eventId, uid, participantCode, existing: false };
  });
});

exports.claimStamp = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Firebase anonymous auth is required.");
  }

  const uid = request.auth.uid;
  const eventId = String(request.data && request.data.eventId ? request.data.eventId : EVENT_ID);
  const requestId = cleanRequestId(request.data && request.data.requestId);

  if (eventId !== EVENT_ID) {
    throw new HttpsError("invalid-argument", "Unsupported eventId.");
  }
  const stampPoint = await findStampPoint(eventId, request.data || {});
  if (!requestId) {
    throw new HttpsError("invalid-argument", "requestId is required.");
  }
  if (!stampPoint) {
    throw new HttpsError("invalid-argument", "Unknown stamp point.");
  }

  const participantRef = db.collection("events").doc(eventId).collection("participants").doc(uid);
  const stampRef = participantRef.collection("stamps").doc(stampPoint.pointId);
  const idempotencyRef = db.collection("idempotency").doc(`stamp_${eventId}_${requestId}`);
  const now = admin.firestore.FieldValue.serverTimestamp();

  return db.runTransaction(async (tx) => {
    const [participantSnap, stampSnap, idempotencySnap] = await Promise.all([
      tx.get(participantRef),
      tx.get(stampRef),
      tx.get(idempotencyRef),
    ]);

    if (!participantSnap.exists) {
      throw new HttpsError("failed-precondition", "Participant is not registered.");
    }

    const participant = participantSnap.data() || {};
    if (idempotencySnap.exists) {
      const previous = idempotencySnap.data() || {};
      if (previous.uid === uid && previous.pointId === stampPoint.pointId) {
        return {
          eventId,
          uid,
          participantCode: participant.participantCode || "",
          pointId: stampPoint.pointId,
          pointName: stampPoint.name,
          stampCount: Number(participant.stampCount || 0),
          completed: Boolean(participant.completed),
          alreadyClaimed: Boolean(stampSnap.exists),
        };
      }
      throw new HttpsError("already-exists", "This requestId was already used.");
    }

    if (stampSnap.exists) {
      const currentCount = Number(participant.stampCount || 0);
      tx.set(idempotencyRef, {
        eventId,
        uid,
        pointId: stampPoint.pointId,
        status: "duplicate",
        createdAt: now,
        updatedAt: now,
      });
      tx.set(participantRef, { lastSeenAt: now, lastStampPointId: stampPoint.pointId }, { merge: true });
      return {
        eventId,
        uid,
        participantCode: participant.participantCode || "",
        pointId: stampPoint.pointId,
        pointName: stampPoint.name,
        stampCount: currentCount,
        completed: currentCount >= REQUIRED_STAMPS,
        alreadyClaimed: true,
      };
    }

    const nextCount = Number(participant.stampCount || 0) + 1;
    const completed = nextCount >= REQUIRED_STAMPS;
    tx.set(stampRef, {
      pointId: stampPoint.pointId,
      pointName: stampPoint.name,
      pointCode: stampPoint.code,
      claimedAt: now,
      claimMethod: "qr",
      qrVersion: 1,
      status: "valid",
    });
    tx.set(
      participantRef,
      {
        stampCount: nextCount,
        completed,
        lastStampPointId: stampPoint.pointId,
        lastSeenAt: now,
        schemaVersion: 2,
      },
      { merge: true },
    );
    tx.set(idempotencyRef, {
      eventId,
      uid,
      pointId: stampPoint.pointId,
      status: "created",
      createdAt: now,
      updatedAt: now,
    });

    return {
      eventId,
      uid,
      participantCode: participant.participantCode || "",
      pointId: stampPoint.pointId,
      pointName: stampPoint.name,
      stampCount: nextCount,
      completed,
      alreadyClaimed: false,
    };
  });
});
