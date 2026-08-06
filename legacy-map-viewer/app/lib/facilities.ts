// 시설물 프리셋. 실제 미터 크기(w,h)를 가진 사각 박스로 지도에 올린다.
export type Facility = {
  id: string;
  name: string;
  w: number; // 가로(m)
  h: number; // 세로(m)
  color: string;
  icon: string;
};

export const FACILITIES: Facility[] = [
  { id: "stage", name: "메인 무대", w: 12, h: 8, color: "#5c6ac4", icon: "🎤" },
  { id: "booth", name: "기본 부스", w: 3, h: 3, color: "#f0a43c", icon: "🏪" },
  { id: "boothL", name: "대형 부스", w: 6, h: 3, color: "#ed7b45", icon: "🏬" },
  { id: "tent", name: "몽골 텐트", w: 5, h: 5, color: "#20a779", icon: "⛺" },
  { id: "food", name: "푸드트럭", w: 6, h: 2.5, color: "#e05858", icon: "🚚" },
  { id: "hq", name: "운영본부", w: 6, h: 3, color: "#3d8bd9", icon: "★" },
  { id: "medical", name: "의무실", w: 4, h: 3, color: "#de4c61", icon: "✚" },
  { id: "restroom", name: "화장실", w: 4, h: 3, color: "#8a6fdb", icon: "🚻" },
  { id: "parking", name: "주차 구역", w: 10, h: 6, color: "#5c7cfa", icon: "P" },
];

export const facilityById = (id: string) => FACILITIES.find((f) => f.id === id);

// 미터 → 위경도 반경(대략)
export const METERS_PER_DEG_LAT = 111320;
export const mPerDegLng = (lat: number) =>
  111320 * Math.cos((lat * Math.PI) / 180);
