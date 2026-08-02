// 편집기와 관람 페이지가 함께 쓰는 박스 유틸.

export type BoxData = {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  w: number; // m
  h: number; // m
};

export type LayoutData = {
  boxes: BoxData[];
  center: { lat: number; lng: number };
  zoom: number;
};

export type LatLng = { lat: number; lng: number };

// 새 편집기(saegim-event-map-editor)의 요소 형식
export type EditorElement = {
  id?: string;
  type?: string;
  shape?: "rect" | "point" | "text" | "path" | "curve" | "zone";
  name?: string;
  code?: string; // 도장/QR 코드 (있으면 스탬프 대상)
  color?: string;
  visible?: boolean;
  icon?: string;
  center?: LatLng; // rect
  width?: number; // rect (m)
  height?: number; // rect (m)
  opacity?: number;
  position?: LatLng; // point / text
  points?: LatLng[]; // path / curve / zone
  strokeWidth?: number;
};

export type PublishedProject = {
  version?: number;
  event?: { center?: LatLng; title?: string };
  elements?: EditorElement[];
};

// 2차 베지에 곡선을 점들로 샘플링 (points = [start, control, end])
export function quadraticBezierSample(pts: LatLng[]): LatLng[] {
  if (!pts || pts.length < 3) return pts || [];
  const [p0, c, p1] = pts;
  const out: LatLng[] = [];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mt = 1 - t;
    out.push({
      lat: mt * mt * p0.lat + 2 * mt * t * c.lat + t * t * p1.lat,
      lng: mt * mt * p0.lng + 2 * mt * t * c.lng + t * t * p1.lng,
    });
  }
  return out;
}

// 라벨 텍스트를 SVG 이미지 data URL 로
export function textSrc(text: string, color: string) {
  const fs = 14;
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const w = Math.max(20, [...text].length * fs + 8);
  const h = Math.round(fs * 1.6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${w / 2}" y="${h - 5}" font-size="${fs}" font-weight="800" text-anchor="middle" fill="${color}" stroke="white" stroke-width="3" paint-order="stroke">${safe}</text></svg>`;
  return { url: "data:image/svg+xml," + encodeURIComponent(svg), w, h };
}

// 중심+크기(m) → LatLngBounds
export function boundsFromCenter(
  g: typeof google,
  lat: number,
  lng: number,
  w: number,
  h: number,
) {
  const dLat = h / 2 / 111320;
  const dLng = w / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return new g.maps.LatLngBounds(
    { lat: lat - dLat, lng: lng - dLng },
    { lat: lat + dLat, lng: lng + dLng },
  );
}

// Rectangle bounds → 중심+크기(m)
export function rectToCenterSize(rect: google.maps.Rectangle) {
  const b = rect.getBounds();
  if (!b) return null;
  const ne = b.getNorthEast();
  const sw = b.getSouthWest();
  const lat = (ne.lat() + sw.lat()) / 2;
  const lng = (ne.lng() + sw.lng()) / 2;
  const h = (ne.lat() - sw.lat()) * 111320;
  const w = (ne.lng() - sw.lng()) * 111320 * Math.cos((lat * Math.PI) / 180);
  return { lat, lng, w, h };
}

// 줌에 따른 격자 간격(m)
export function spacingForZoom(zoom: number) {
  return zoom >= 20
    ? 1
    : zoom >= 19
      ? 2
      : zoom >= 18
        ? 5
        : zoom >= 16
          ? 10
          : zoom >= 14
            ? 50
            : 200;
}

// 위경도를 현재 격자 간격에 스냅
export function snapLatLng(map: google.maps.Map, lat: number, lng: number) {
  const s = spacingForZoom(map.getZoom() ?? 18);
  const dLat = s / 111320;
  const dLng = s / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    lat: Math.round(lat / dLat) * dLat,
    lng: Math.round(lng / dLng) * dLng,
  };
}
