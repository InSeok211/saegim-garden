// 카카오맵 순수 JavaScript SDK 로더.
// 공식 샘플처럼 dapi.kakao.com 의 sdk.js 를 직접 불러와서 kakao.maps 를 준비한다.
// - autoload=false 로 받고 kakao.maps.load(cb) 로 초기화
// - http 페이지에서도 SDK 는 https 로 강제 (그래야 로드 실패가 없음)

const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

let loader: Promise<typeof kakao> | null = null;

export function loadKakao(): Promise<typeof kakao> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 로드할 수 있습니다."));
  }
  // 이미 로드됨
  if (window.kakao && window.kakao.maps) {
    return Promise.resolve(window.kakao);
  }
  // 로드 진행 중이면 그 Promise 재사용
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    if (!KEY) {
      reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 가 설정되지 않았습니다."));
      return;
    }
    const script = document.createElement("script");
    // libraries=drawing → 그리기 도구(DrawingManager, Toolbox) 사용
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false&libraries=drawing`;
    script.async = true;
    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => reject(new Error("카카오맵 SDK 로드에 실패했습니다."));
    document.head.appendChild(script);
  });

  return loader;
}
