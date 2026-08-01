// 마커 카테고리 프리셋. 마커는 categoryId 로 이 목록을 참조하고,
// 색·아이콘은 여기서 파생된다. (목업의 카테고리 색 핀 개념)

export type Category = {
  id: string;
  name: string;
  color: string; // 핀 색
  icon: string; // 핀 안 아이콘(이모지)
};

export const CATEGORIES: Category[] = [
  { id: "stage", name: "무대", color: "#7c3aed", icon: "🎤" },
  { id: "food", name: "음식", color: "#f97316", icon: "🍔" },
  { id: "toilet", name: "화장실", color: "#3b82f6", icon: "🚻" },
  { id: "parking", name: "주차", color: "#22c55e", icon: "🅿️" },
  { id: "info", name: "안내", color: "#0ea5e9", icon: "ℹ️" },
  { id: "medical", name: "의무실", color: "#ef4444", icon: "🚑" },
  { id: "camp", name: "캠핑", color: "#14b8a6", icon: "⛺" },
  { id: "entrance", name: "입구", color: "#64748b", icon: "🚪" },
];

export const categoryById = (id: string | undefined): Category | undefined =>
  CATEGORIES.find((c) => c.id === id);
