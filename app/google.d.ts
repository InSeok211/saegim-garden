// 구글 지도 전역 타입.
/// <reference types="google.maps" />

declare global {
  interface Window {
    google: typeof google;
  }
}

export {};
