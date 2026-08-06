"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "asia-northeast3", maxInstances: 20, invoker: "public" });

const db = admin.firestore();
const EVENT_ID = "dadaepo-beer-2026";
const COUNTER_ID = EVENT_ID;
const CODE_PREFIX = "A";
const CODE_DIGITS = 5;
const REQUIRED_STAMPS = 5;
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

function findStampPoint(data) {
  const rawCode = typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
  const rawPointId = typeof data.pointId === "string" ? data.pointId.trim() : "";
  if (rawPointId && STAMP_POINTS[rawPointId]) return { pointId: rawPointId, ...STAMP_POINTS[rawPointId] };
  return Object.entries(STAMP_POINTS)
    .map(([pointId, point]) => ({ pointId, ...point }))
    .find((point) => point.code === rawCode);
}

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
  const stampPoint = findStampPoint(request.data || {});

  if (eventId !== EVENT_ID) {
    throw new HttpsError("invalid-argument", "Unsupported eventId.");
  }
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
