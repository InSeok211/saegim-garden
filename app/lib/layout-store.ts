import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { PublishedProject } from "./box-utils";

// 편집기가 게시한 배치도를 layouts/main 문서에서 읽는다.
const layoutRef = doc(db, "layouts", "main");

export async function saveLayout(data: PublishedProject) {
  await setDoc(layoutRef, { ...data, updatedAt: Date.now() });
}

export async function loadLayout(): Promise<PublishedProject | null> {
  const snap = await getDoc(layoutRef);
  return snap.exists() ? (snap.data() as PublishedProject) : null;
}

export function subscribeLayout(cb: (data: PublishedProject | null) => void) {
  return onSnapshot(layoutRef, (snap) =>
    cb(snap.exists() ? (snap.data() as PublishedProject) : null),
  );
}
