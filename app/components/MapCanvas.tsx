"use client";

import { Fragment, useState } from "react";
import {
  Map,
  MapMarker,
  CustomOverlayMap,
  Circle,
  Polygon,
  Polyline,
  useKakaoLoader,
} from "react-kakao-maps-sdk";
import {
  type MapElement,
  type Bounds,
  type LatLng,
  DEFAULT_CENTER,
  DEFAULT_LEVEL,
  rectCorners,
  boundsCenter,
  resizeRect,
  haversine,
  eastPoint,
  pathLength,
  formatDistance,
} from "@/app/lib/map-types";
import { categoryById } from "@/app/lib/categories";
import type { Preview } from "./MapEditor";

type Props = {
  elements: MapElement[];
  hint: string | null;
  preview: Preview;
  selectedId: string | null;
  hiddenCategories: string[]; // 숨긴 카테고리 id
  query: string; // 검색어
  draft: LatLng[]; // 다각형/선 그리는 중 점들
  draftMode: "polygon" | "line" | null;
  onMapClick: (lat: number, lng: number) => void;
  onMouseMove: (lat: number, lng: number) => void;
  onFinishDraw: () => void;
  onCancelDraw: () => void;
  onUpdate: (id: string, patch: Partial<MapElement>) => void;
  onSelect: (id: string) => void;
};

// 카테고리 색 핀(물방울 모양) 이미지 — 목업 스타일
function pinSrc(color: string, icon: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="54" viewBox="0 0 40 54"><path d="M20 53 C20 53 37 31 37 18 A17 17 0 1 0 3 18 C3 31 20 53 20 53 Z" fill="${color}" stroke="white" stroke-width="3"/><circle cx="20" cy="18" r="12" fill="white"/><text x="20" y="23" font-size="15" text-anchor="middle">${icon}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
function labelSrc(text: string, color: string) {
  const fs = 16;
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const w = Math.max(24, [...text].length * fs + 8);
  const h = Math.round(fs * 1.6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="2" y="${h - 5}" font-size="${fs}" font-weight="700" fill="${color}" stroke="white" stroke-width="3" paint-order="stroke">${safe}</text></svg>`;
  return { src: "data:image/svg+xml," + encodeURIComponent(svg), w, h };
}

// 크기조절 핸들 이미지 (흰 사각형 / 흰 원, 파란 테두리)
const HANDLE_SQUARE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><rect x="1" y="1" width="12" height="12" fill="white" stroke="#2563eb" stroke-width="2"/></svg>`,
  );
const HANDLE_DOT =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="6" fill="white" stroke="#2563eb" stroke-width="2"/></svg>`,
  );
const handleImg = (src: string) => ({
  src,
  size: { width: 14, height: 14 },
  options: { offset: { x: 7, y: 7 } },
});

export default function MapCanvas({
  elements,
  hint,
  preview,
  selectedId,
  hiddenCategories,
  query,
  draft,
  draftMode,
  onMapClick,
  onMouseMove,
  onFinishDraw,
  onCancelDraw,
  onUpdate,
  onSelect,
}: Props) {
  const [loading, error] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "",
    url: "https://dapi.kakao.com/v2/maps/sdk.js",
  });

  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [myPos, setMyPos] = useState<{
    lat: number;
    lng: number;
    acc: number;
  } | null>(null);

  const locate = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 기능을 지원하지 않습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setMyPos({ lat: latitude, lng: longitude, acc: accuracy });
        setCenter({ lat: latitude, lng: longitude });
        setLevel(3);
      },
      () => {
        alert(
          "위치를 가져올 수 없습니다. 브라우저의 위치 접근 권한을 확인해주세요.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  if (error) {
    return (
      <div className="map-state-card px-6 text-red-700" role="alert">
        <strong className="text-base">지도를 불러오지 못했습니다.</strong>
        <span className="max-w-md text-sm leading-6">카카오 지도 키, 허용 도메인, 서비스 활성화 상태를 확인해주세요.</span>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="map-state-card" role="status">
        <span className="ui-spinner" aria-hidden="true" />
        <span>지도를 불러오는 중입니다.</span>
      </div>
    );
  }

  // 검색어 매칭 (이름 / 마커는 카테고리 이름도)
  const q = query.trim().toLowerCase();
  const matchesQuery = (el: MapElement) => {
    if (!q) return true;
    const name = (el.label ?? "").toLowerCase();
    const cat =
      el.type === "marker"
        ? (categoryById(el.categoryId)?.name.toLowerCase() ?? "")
        : "";
    return name.includes(q) || cat.includes(q);
  };

  // 점 마커(카테고리 마커 + 텍스트 라벨)
  const markers = elements.filter(
    (e) =>
      (e.type === "marker" || e.type === "label") &&
      !(e.type === "marker" && hiddenCategories.includes(e.categoryId ?? "")) &&
      matchesQuery(e),
  );
  const zones = elements.filter((e) => e.type === "zone" && matchesQuery(e));
  const lines = elements.filter((e) => e.type === "line" && matchesQuery(e));

  // 사각형 크기조절 핸들 (모서리 4개 + 이동용 중심 1개)
  const rectHandles = (id: string, b: Bounds) => {
    const corners: { pos: string; ll: LatLng }[] = [
      { pos: "nw", ll: { lat: b.maxLat, lng: b.minLng } },
      { pos: "ne", ll: { lat: b.maxLat, lng: b.maxLng } },
      { pos: "se", ll: { lat: b.minLat, lng: b.maxLng } },
      { pos: "sw", ll: { lat: b.minLat, lng: b.minLng } },
    ];
    const c = boundsCenter(b);
    return (
      <>
        {corners.map((cn) => (
          <MapMarker
            key={cn.pos}
            position={cn.ll}
            draggable
            image={handleImg(HANDLE_SQUARE)}
            onDragEnd={(m) => {
              const p = m.getPosition();
              onUpdate(id, {
                bounds: resizeRect(b, cn.pos, {
                  lat: p.getLat(),
                  lng: p.getLng(),
                }),
              });
            }}
          />
        ))}
        <MapMarker
          key="center"
          position={c}
          draggable
          image={handleImg(HANDLE_DOT)}
          onDragEnd={(m) => {
            const p = m.getPosition();
            const dLat = p.getLat() - c.lat;
            const dLng = p.getLng() - c.lng;
            onUpdate(id, {
              bounds: {
                minLat: b.minLat + dLat,
                maxLat: b.maxLat + dLat,
                minLng: b.minLng + dLng,
                maxLng: b.maxLng + dLng,
              },
            });
          }}
        />
      </>
    );
  };

  // 원 핸들 (이동용 중심 + 크기용 동쪽 점)
  const circleHandles = (id: string, c: LatLng, radius: number) => (
    <>
      <MapMarker
        key="c"
        position={c}
        draggable
        image={handleImg(HANDLE_DOT)}
        onDragEnd={(m) => {
          const p = m.getPosition();
          onUpdate(id, { lat: p.getLat(), lng: p.getLng() });
        }}
      />
      <MapMarker
        key="r"
        position={eastPoint(c, radius)}
        draggable
        image={handleImg(HANDLE_SQUARE)}
        onDragEnd={(m) => {
          const p = m.getPosition();
          const r = Math.max(5, haversine(c, { lat: p.getLat(), lng: p.getLng() }));
          onUpdate(id, { radius: r });
        }}
      />
    </>
  );

  return (
    <div className="relative h-[clamp(440px,58dvh,720px)] min-h-[440px] overflow-hidden rounded-[18px] bg-slate-100 lg:h-[680px]" aria-label="축제 배치도 지도">
      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[100] w-[calc(100%-112px)] max-w-md -translate-x-1/2 rounded-xl bg-blue-700 px-4 py-3 text-center text-sm font-bold leading-5 text-white shadow-lg max-md:hidden">
          {hint}
        </div>
      )}

      <button
        onClick={locate}
        className="ui-touch absolute right-3 top-3 z-[100] flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-lg hover:bg-slate-50"
      >
        <span aria-hidden="true">◎</span> 내 위치
      </button>

      <Map
        center={center}
        level={level}
        isPanto
        style={{ width: "100%", height: "100%", borderRadius: 18 }}
        onClick={(_m, me) => onMapClick(me.latLng.getLat(), me.latLng.getLng())}
        onMouseMove={(_m, me) =>
          onMouseMove(me.latLng.getLat(), me.latLng.getLng())
        }
      >
        {/* 구역 */}
        {zones.map((z) => {
          const sel = z.id === selectedId;
          const stroke = sel ? "#2563eb" : "#374151";
          const sw = sel ? 4 : 2;
          return (
            <Fragment key={z.id}>
              {z.shape === "circle" && z.radius != null ? (
                <Circle
                  center={{ lat: z.lat, lng: z.lng }}
                  radius={z.radius}
                  fillColor={z.color}
                  fillOpacity={0.4}
                  strokeColor={stroke}
                  strokeWeight={sw}
                  strokeOpacity={0.9}
                  onClick={() => onSelect(z.id)}
                />
              ) : (
                <Polygon
                  path={
                    z.shape === "rect" && z.bounds
                      ? rectCorners(z.bounds)
                      : (z.path ?? [])
                  }
                  fillColor={z.color}
                  fillOpacity={0.4}
                  strokeColor={stroke}
                  strokeWeight={sw}
                  strokeOpacity={0.9}
                  onClick={() => onSelect(z.id)}
                />
              )}

              <CustomOverlayMap position={{ lat: z.lat, lng: z.lng }}>
                <div
                  onClick={() => onSelect(z.id)}
                  className="cursor-pointer whitespace-nowrap rounded-lg border border-white/70 bg-white/95 px-2 py-1 text-sm font-bold text-slate-900 shadow-sm"
                >
                  {z.label}
                </div>
              </CustomOverlayMap>

              {sel && z.shape === "rect" && z.bounds && rectHandles(z.id, z.bounds)}
              {sel &&
                z.shape === "circle" &&
                z.radius != null &&
                circleHandles(z.id, { lat: z.lat, lng: z.lng }, z.radius)}
            </Fragment>
          );
        })}

        {/* 선 · 경로 (거리 표시) */}
        {lines.map((ln) => {
          const sel = ln.id === selectedId;
          const path = ln.path ?? [];
          return (
            <Fragment key={ln.id}>
              <Polyline
                path={path}
                strokeColor={ln.color}
                strokeWeight={sel ? 6 : 4}
                strokeOpacity={0.9}
                onClick={() => onSelect(ln.id)}
              />
              <CustomOverlayMap position={{ lat: ln.lat, lng: ln.lng }}>
                <div
                  onClick={() => onSelect(ln.id)}
                  className="cursor-pointer whitespace-nowrap rounded-lg border border-white/70 bg-white/95 px-2 py-1 text-xs font-bold text-slate-900 shadow-sm"
                >
                  {ln.label} · {formatDistance(pathLength(path))}
                </div>
              </CustomOverlayMap>
            </Fragment>
          );
        })}

        {/* 다각형/선 그리는 중 미리보기 */}
        {draft.length > 0 && (
          <>
            {draftMode === "polygon" && draft.length >= 3 && (
              <Polygon
                path={draft}
                fillColor="#2563eb"
                fillOpacity={0.15}
                strokeColor="#2563eb"
                strokeWeight={2}
                strokeStyle="shortdash"
              />
            )}
            <Polyline
              path={draft}
              strokeColor="#2563eb"
              strokeWeight={2}
              strokeStyle="shortdash"
            />
            {draft.map((p, i) => (
              <CustomOverlayMap key={i} position={p}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    background: "#2563eb",
                    border: "1px solid white",
                  }}
                />
              </CustomOverlayMap>
            ))}
          </>
        )}

        {/* 그리는 중 미리보기 */}
        {preview?.type === "rect" && (
          <Polygon
            path={preview.corners}
            fillColor="#2563eb"
            fillOpacity={0.15}
            strokeColor="#2563eb"
            strokeWeight={2}
            strokeStyle="shortdash"
          />
        )}
        {preview?.type === "circle" && (
          <Circle
            center={preview.center}
            radius={preview.radius}
            fillColor="#2563eb"
            fillOpacity={0.15}
            strokeColor="#2563eb"
            strokeWeight={2}
            strokeStyle="shortdash"
          />
        )}

        {/* 마커 */}
        {markers.map((el) => {
          let image;
          if (el.type === "marker") {
            const cat = categoryById(el.categoryId);
            image = {
              src: pinSrc(cat?.color ?? "#64748b", cat?.icon ?? "📍"),
              size: { width: 40, height: 54 },
              // 핀 끝(아래 중앙)이 좌표를 가리키도록
              options: { offset: { x: 20, y: 54 } },
            };
          } else {
            const { src, w, h } = labelSrc(el.label, el.color);
            image = {
              src,
              size: { width: w, height: h },
              options: { offset: { x: 2, y: h - 5 } },
            };
          }

          return (
            <MapMarker
              key={el.id}
              position={{ lat: el.lat, lng: el.lng }}
              draggable
              image={image}
              onClick={() => onSelect(el.id)}
              onDragEnd={(marker) => {
                const p = marker.getPosition();
                onUpdate(el.id, { lat: p.getLat(), lng: p.getLng() });
              }}
            />
          );
        })}

        {/* GPS 현재 위치 */}
        {myPos && (
          <>
            <Circle
              center={{ lat: myPos.lat, lng: myPos.lng }}
              radius={myPos.acc}
              strokeWeight={1}
              strokeColor="#3b82f6"
              strokeOpacity={0.6}
              fillColor="#3b82f6"
              fillOpacity={0.1}
            />
            <CustomOverlayMap position={{ lat: myPos.lat, lng: myPos.lng }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 9999,
                  background: "#2563eb",
                  border: "2px solid white",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.2)",
                }}
              />
            </CustomOverlayMap>
          </>
        )}
      </Map>

      {/* 다각형/선 그리기 완료·취소 바 */}
      {draftMode && (
        <div className="absolute bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-lg">
          <span className="px-1 text-sm font-semibold text-slate-700">
            {draftMode === "polygon" ? "다각형" : "선"} · 점 {draft.length}개
          </span>
          <button
            type="button"
            onClick={onFinishDraw}
            className="rounded-full bg-blue-600 px-3 py-1.5 text-sm font-bold text-white"
          >
            완료
          </button>
          <button
            type="button"
            onClick={onCancelDraw}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}
