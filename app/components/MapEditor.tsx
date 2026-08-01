"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/app/lib/google-maps";
import { FACILITIES, facilityById } from "@/app/lib/facilities";

const DEFAULT_CENTER = { lat: 35.0455, lng: 128.9668 };
const DEFAULT_ZOOM = 18; // 박스가 보이도록 가깝게

const HIDE_LABELS: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
];

type BoxData = {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  w: number; // m
  h: number; // m
};

let counter = 0;
const newId = () => `b_${Date.now()}_${counter++}`;

// 라벨 텍스트를 SVG 이미지로
function textSrc(text: string, color: string) {
  const fs = 14;
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const w = Math.max(20, [...text].length * fs + 8);
  const h = Math.round(fs * 1.6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${w / 2}" y="${h - 5}" font-size="${fs}" font-weight="800" text-anchor="middle" fill="${color}" stroke="white" stroke-width="3" paint-order="stroke">${safe}</text></svg>`;
  return { url: "data:image/svg+xml," + encodeURIComponent(svg), w, h };
}

function boundsFromCenter(
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

// 줌에 따른 격자 간격(m)
function spacingForZoom(zoom: number) {
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
function snapLatLng(map: google.maps.Map, lat: number, lng: number) {
  const s = spacingForZoom(map.getZoom() ?? 18);
  const dLat = s / 111320;
  const dLng = s / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    lat: Math.round(lat / dLat) * dLat,
    lng: Math.round(lng / dLng) * dLng,
  };
}

function rectToCenterSize(rect: google.maps.Rectangle) {
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

export default function MapEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const meMarkerRef = useRef<google.maps.Marker | null>(null);
  const boxObjs = useRef<
    Map<string, { rect: google.maps.Rectangle; label: google.maps.Marker }>
  >(new Map());

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [labelsHidden, setLabelsHidden] = useState(false);
  const [boxes, setBoxes] = useState<BoxData[]>([]);
  const [activeFacility, setActiveFacility] = useState<string | null>(null);
  const [gridOn, setGridOn] = useState(false);
  const [snapOn, setSnapOn] = useState(false);

  const activeFacilityRef = useRef<string | null>(null);
  activeFacilityRef.current = activeFacility;
  const gridOnRef = useRef(false);
  gridOnRef.current = gridOn;
  const snapOnRef = useRef(false);
  snapOnRef.current = snapOn;
  const gridLinesRef = useRef<google.maps.Polyline[]>([]);
  const drawGridRef = useRef<() => void>(() => {});

  const addBoxRef = useRef<(lat: number, lng: number) => void>(() => {});
  addBoxRef.current = (lat, lng) => {
    const f = facilityById(activeFacilityRef.current ?? "");
    if (!f) return;
    let c = { lat, lng };
    if (snapOnRef.current && mapRef.current) {
      c = snapLatLng(mapRef.current, lat, lng);
    }
    setBoxes((prev) => [
      ...prev,
      { id: newId(), name: f.name, color: f.color, lat: c.lat, lng: c.lng, w: f.w, h: f.h },
    ]);
  };
  const updateBoxRef = useRef<(id: string, cs: Omit<BoxData, "id" | "name" | "color">) => void>(
    () => {},
  );
  updateBoxRef.current = (id, cs) =>
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...cs } : b)));
  const removeBoxRef = useRef<(id: string) => void>(() => {});
  removeBoxRef.current = (id) => setBoxes((prev) => prev.filter((b) => b.id !== id));

  // ── 지도 초기화 ──
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapRef.current = map;
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) addBoxRef.current(e.latLng.lat(), e.latLng.lng());
        });
        // 지도 이동/줌이 끝날 때 격자 다시 그림
        map.addListener("idle", () => drawGridRef.current());
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── boxes → Rectangle + 라벨 동기화 ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const g = window.google;
    const objs = boxObjs.current;

    boxes.forEach((b) => {
      if (objs.has(b.id)) return;
      const rect = new g.maps.Rectangle({
        bounds: boundsFromCenter(g, b.lat, b.lng, b.w, b.h),
        map,
        editable: true,
        draggable: true,
        fillColor: b.color,
        fillOpacity: 0.35,
        strokeColor: b.color,
        strokeWeight: 2,
      });
      const { url, w: lw, h: lh } = textSrc(b.name, "#111827");
      const label = new g.maps.Marker({
        position: { lat: b.lat, lng: b.lng },
        map,
        icon: {
          url,
          scaledSize: new g.maps.Size(lw, lh),
          anchor: new g.maps.Point(lw / 2, lh / 2),
        },
      });
      rect.addListener("bounds_changed", () => {
        const cs = rectToCenterSize(rect);
        if (!cs) return;
        updateBoxRef.current(b.id, cs);
        label.setPosition({ lat: cs.lat, lng: cs.lng });
      });
      // 드래그 이동을 마치면 격자에 스냅
      rect.addListener("dragend", () => {
        if (!snapOnRef.current || !mapRef.current) return;
        const cs = rectToCenterSize(rect);
        if (!cs) return;
        const sn = snapLatLng(mapRef.current, cs.lat, cs.lng);
        rect.setBounds(boundsFromCenter(g, sn.lat, sn.lng, cs.w, cs.h));
      });
      // 라벨 클릭 → 삭제
      label.addListener("click", () => removeBoxRef.current(b.id));
      objs.set(b.id, { rect, label });
    });

    objs.forEach((o, id) => {
      if (!boxes.some((b) => b.id === id)) {
        o.rect.setMap(null);
        o.label.setMap(null);
        objs.delete(id);
      }
    });
  }, [boxes, status]);

  const toggleLabels = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !labelsHidden;
    map.setOptions({ styles: next ? HIDE_LABELS : [] });
    setLabelsHidden(next);
  };

  const locate = () => {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.setCenter(p);
        meMarkerRef.current?.setMap(null);
        meMarkerRef.current = new window.google.maps.Marker({
          position: p,
          map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#2563eb",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
          title: "내 위치",
        });
      },
      () => alert("위치를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ── 반투명 격자 오버레이 (지도와 함께 이동) ──
  const clearGrid = () => {
    gridLinesRef.current.forEach((l) => l.setMap(null));
    gridLinesRef.current = [];
  };
  const drawGrid = () => {
    const map = mapRef.current;
    const g = window.google;
    if (!map || !g) return;
    clearGrid();
    if (!gridOnRef.current) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const zoom = map.getZoom() ?? 18;
    const spacingM = spacingForZoom(zoom);
    const midLat = (ne.lat() + sw.lat()) / 2;
    const dLat = spacingM / 111320;
    const dLng = spacingM / (111320 * Math.cos((midLat * Math.PI) / 180));
    const opts = {
      strokeColor: "#2563eb",
      strokeOpacity: 0.2,
      strokeWeight: 1,
      clickable: false,
      map,
    };
    const latStart = Math.floor(sw.lat() / dLat) * dLat;
    for (let lat = latStart; lat <= ne.lat(); lat += dLat) {
      gridLinesRef.current.push(
        new g.maps.Polyline({
          ...opts,
          path: [
            { lat, lng: sw.lng() },
            { lat, lng: ne.lng() },
          ],
        }),
      );
    }
    const lngStart = Math.floor(sw.lng() / dLng) * dLng;
    for (let lng = lngStart; lng <= ne.lng(); lng += dLng) {
      gridLinesRef.current.push(
        new g.maps.Polyline({
          ...opts,
          path: [
            { lat: sw.lat(), lng },
            { lat: ne.lat(), lng },
          ],
        }),
      );
    }
  };
  drawGridRef.current = drawGrid;
  const toggleGrid = () => {
    const next = !gridOn;
    gridOnRef.current = next;
    setGridOn(next);
    drawGrid();
  };

  return (
    <div>
      {/* 시설물 팔레트 (크기 표시) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FACILITIES.map((f) => {
          const active = activeFacility === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFacility((c) => (c === f.id ? null : f.id))}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span
                className="grid h-5 w-5 place-items-center rounded text-[11px]"
                style={{ backgroundColor: active ? "rgba(255,255,255,.25)" : f.color }}
              >
                {f.icon}
              </span>
              {f.name}
              <span className="text-xs opacity-70">
                {f.w}×{f.h}m
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={toggleLabels}
          disabled={status !== "ready"}
          className={`rounded-lg border px-3 py-1.5 font-semibold transition disabled:opacity-50 ${
            labelsHidden
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {labelsHidden ? "라벨 표시" : "라벨 숨기기"}
        </button>
        <button
          type="button"
          onClick={toggleGrid}
          disabled={status !== "ready"}
          className={`rounded-lg border px-3 py-1.5 font-semibold transition disabled:opacity-50 ${
            gridOn
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {gridOn ? "격자 끄기" : "격자 표시"}
        </button>
        <button
          type="button"
          onClick={() => setSnapOn((v) => !v)}
          disabled={status !== "ready"}
          className={`rounded-lg border px-3 py-1.5 font-semibold transition disabled:opacity-50 ${
            snapOn
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {snapOn ? "스냅 켜짐" : "격자 스냅"}
        </button>
        <button
          type="button"
          onClick={locate}
          disabled={status !== "ready"}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          📍 내 위치
        </button>
        <span className="text-slate-600">
          {activeFacility
            ? `“${facilityById(activeFacility)?.name}” — 지도를 클릭해 배치 (박스 드래그로 이동, 모서리로 크기, 이름 클릭 시 삭제)`
            : "시설물을 고르고 지도를 클릭하세요."}
        </span>
        <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
          시설물 {boxes.length}
        </span>
        {boxes.length > 0 && (
          <button
            type="button"
            onClick={() => setBoxes([])}
            className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            전체 지우기
          </button>
        )}
      </div>

      <div className="relative h-[clamp(440px,60dvh,720px)] min-h-[440px] w-full overflow-hidden rounded-2xl bg-slate-100">
        <div ref={containerRef} className="h-full w-full" />
        {status === "loading" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-slate-500">
            지도 불러오는 중…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-600">
            지도를 불러오지 못했습니다. 구글 키/결제 설정/도메인 제한을
            확인해주세요.
          </div>
        )}
      </div>
    </div>
  );
}
