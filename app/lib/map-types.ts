// 지도 위에 놓는 요소 하나의 데이터 구조.
// 픽셀(x/y)이 아니라 지리 좌표(위도 lat / 경도 lng)를 가진다.

export type MapElementType = "icon" | "label" | "zone";

export type LatLng = { lat: number; lng: number };

// 구역 도형 종류
export type ZoneShape = "rect" | "circle" | "polygon";

// 사각형 영역 (위/경도 최소·최대)
export type Bounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type MapElement = {
  id: string;
  type: MapElementType;
  lat: number; // point 위치 / zone 은 중심(라벨 표시용)
  lng: number;
  label: string; // label/zone 의 표시 글자
  color: string; // label 글자색 / zone 채움색
  icon?: string; // icon 타입의 이모지
  shape?: ZoneShape; // zone 도형 종류
  bounds?: Bounds; // shape === "rect"
  radius?: number; // shape === "circle" (미터)
  path?: LatLng[]; // shape === "polygon"
};

// ── 도형 계산 헬퍼 ─────────────────────────────────────────

// 두 지점 사이 거리(미터) — 하버사인 공식
export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// 두 모서리 점 → 정규화된 bounds
export function boundsFromCorners(a: LatLng, b: LatLng): Bounds {
  return {
    minLat: Math.min(a.lat, b.lat),
    maxLat: Math.max(a.lat, b.lat),
    minLng: Math.min(a.lng, b.lng),
    maxLng: Math.max(a.lng, b.lng),
  };
}

// bounds → 시계방향 네 꼭짓점(폴리곤 렌더용)
export function rectCorners(b: Bounds): LatLng[] {
  return [
    { lat: b.maxLat, lng: b.minLng },
    { lat: b.maxLat, lng: b.maxLng },
    { lat: b.minLat, lng: b.maxLng },
    { lat: b.minLat, lng: b.minLng },
  ];
}

// bounds 중심
export function boundsCenter(b: Bounds): LatLng {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

// 모서리 하나를 새 위치로 → 새 bounds (정규화 포함)
export function resizeRect(b: Bounds, corner: string, p: LatLng): Bounds {
  let { minLat, maxLat, minLng, maxLng } = b;
  if (corner.includes("n")) maxLat = p.lat;
  if (corner.includes("s")) minLat = p.lat;
  if (corner.includes("e")) maxLng = p.lng;
  if (corner.includes("w")) minLng = p.lng;
  return {
    minLat: Math.min(minLat, maxLat),
    maxLat: Math.max(minLat, maxLat),
    minLng: Math.min(minLng, maxLng),
    maxLng: Math.max(minLng, maxLng),
  };
}

// 중심에서 반지름만큼 동쪽 지점(원 크기 핸들 위치)
export function eastPoint(center: LatLng, radius: number): LatLng {
  const dLng = radius / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return { lat: center.lat, lng: center.lng + dLng };
}

// 구역에 쓸 기본 색 팔레트
export const ZONE_COLORS = [
  "#86efac", // 초록
  "#fca5a5", // 빨강
  "#93c5fd", // 파랑
  "#fcd34d", // 노랑
  "#c4b5fd", // 보라
  "#f9a8d4", // 분홍
  "#d1d5db", // 회색
];

// 지도 초기 중심 (다대포 해수욕장 부근). "내 위치"를 누르면 실제 위치로 이동.
export const DEFAULT_CENTER = { lat: 35.0455, lng: 128.9668 };
// 카카오맵 줌 단위 level (작을수록 확대. 3~4가 동네 수준)
export const DEFAULT_LEVEL = 4;

// 팔레트에 노출할 아이콘(이모지) 목록
export const ICON_SET = [
  "🚻", // 화장실
  "ℹ️", // 안내소
  "🎤", // 스테이지
  "🅿️", // 주차
  "🍔", // 음식
  "⛺", // 캠핑
  "🚑", // 의무실
  "🎪", // 부스/텐트
  "🌳", // 나무/숲
  "🎡", // 놀이시설
  "🚪", // 입구
  "🚌", // 셔틀
];
