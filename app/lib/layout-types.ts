// 배치도를 이루는 요소 하나의 데이터 구조.
// 배치도 = 이 요소들의 배열(elements) + 제목.

export type ElementType = "zone" | "text" | "icon";

export type LayoutElement = {
  id: string;
  type: ElementType;
  x: number; // 캔버스 왼쪽 기준 가로 위치(px)
  y: number; // 캔버스 위쪽 기준 세로 위치(px)
  w: number; // 너비(px)
  h: number; // 높이(px)
  label: string; // zone/text 의 표시 글자
  color: string; // zone 배경색 / text 글자색
  icon?: string; // type === "icon" 일 때의 이모지
  fontSize?: number; // type === "text" 일 때의 글자 크기
};

// 캔버스 크기(고정). 좌표 계산을 단순하게 하려고 고정값을 씀.
export const CANVAS_W = 1000;
export const CANVAS_H = 600;

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
