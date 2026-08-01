// MapLibre GL 을 CDN 스크립트로 로드한다.
// (npm import + Turbopack 조합은 워커 로딩(MIME) 문제가 있어 CDN 로드로 우회)
// 타입은 설치된 maplibre-gl 패키지에서 가져오되, 런타임은 CDN 전역(window.maplibregl) 사용.

const VERSION = "5.6.2";
const JS = `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.js`;
const CSS = `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.css`;

declare global {
  interface Window {
    maplibregl: typeof import("maplibre-gl");
  }
}

let loader: Promise<typeof import("maplibre-gl")> | null = null;

export function loadMaplibre(): Promise<typeof import("maplibre-gl")> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 로드할 수 있습니다."));
  }
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    // CSS
    if (!document.getElementById("maplibre-css")) {
      const link = document.createElement("link");
      link.id = "maplibre-css";
      link.rel = "stylesheet";
      link.href = CSS;
      document.head.appendChild(link);
    }
    // JS
    const script = document.createElement("script");
    script.src = JS;
    script.async = true;
    script.onload = () => resolve(window.maplibregl);
    script.onerror = () => reject(new Error("MapLibre 로드에 실패했습니다."));
    document.head.appendChild(script);
  });

  return loader;
}
