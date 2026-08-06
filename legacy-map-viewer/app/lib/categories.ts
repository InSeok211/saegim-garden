// 마커 카테고리 프리셋. 마커는 categoryId 로 이 목록을 참조하고
// 색·아이콘은 여기서 파생된다.

export type Category = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

export const CATEGORIES: Category[] = [
  { id: "stage", name: "무대", color: "#7c3aed", icon: "🎤" },
  { id: "booth", name: "부스", color: "#f0a43c", icon: "🏪" },
  { id: "food", name: "음식", color: "#f97316", icon: "🍔" },
  { id: "toilet", name: "화장실", color: "#3b82f6", icon: "🚻" },
  { id: "parking", name: "주차", color: "#22c55e", icon: "🅿️" },
  { id: "info", name: "안내", color: "#0ea5e9", icon: "ℹ️" },
  { id: "medical", name: "의무실", color: "#ef4444", icon: "🚑" },
  { id: "hq", name: "운영본부", color: "#3d8bd9", icon: "★" },
  { id: "tent", name: "텐트", color: "#14b8a6", icon: "⛺" },
  { id: "entrance", name: "입구", color: "#18a66b", icon: "🚪" },
];

export const categoryById = (id: string | undefined): Category | undefined =>
  CATEGORIES.find((c) => c.id === id);

// 카테고리 색 핀(물방울) 이미지 data URL
export function pinSrc(color: string, icon: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="54" viewBox="0 0 40 54"><path d="M20 53 C20 53 37 31 37 18 A17 17 0 1 0 3 18 C3 31 20 53 20 53 Z" fill="${color}" stroke="white" stroke-width="3"/><circle cx="20" cy="18" r="12" fill="white"/><text x="20" y="23" font-size="15" text-anchor="middle">${icon}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
