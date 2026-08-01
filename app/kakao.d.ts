// 카카오맵 순수 SDK의 전역 타입.
// kakao.maps.d.ts 패키지의 타입을 불러오고, window.kakao 를 타입에 등록한다.
/// <reference types="kakao.maps.d.ts" />

declare global {
  interface Window {
    kakao: typeof kakao;
  }
}

export {};
