// 구글 지도 JavaScript API 로더.
// libraries=drawing(그리기 도구), geometry 포함. callback 방식으로 준비 완료를 알림.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

let loader: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 로드할 수 있습니다."));
  }
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    if (!KEY) {
      reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_KEY 가 설정되지 않았습니다."));
      return;
    }
    const cbName = "__initGoogleMaps__";
    (window as unknown as Record<string, () => void>)[cbName] = () =>
      resolve(window.google);

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=drawing,geometry&loading=async&callback=${cbName}`;
    script.async = true;
    script.onerror = () =>
      reject(new Error("구글 지도 로드에 실패했습니다."));
    document.head.appendChild(script);
  });

  return loader;
}
