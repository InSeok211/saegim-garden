"use client";

import { Fragment, useState } from "react";
import {
  Map,
  MapMarker,
  CustomOverlayMap,
  Circle,
  Polygon,
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
} from "@/app/lib/map-types";
import type { Preview } from "./MapEditor";

type Props = {
  elements: MapElement[];
  armed: boolean;
  hint: string | null;
  preview: Preview;
  selectedId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  onMouseMove: (lat: number, lng: number) => void;
  onUpdate: (id: string, patch: Partial<MapElement>) => void;
  onSelect: (id: string) => void;
};

// 마커 이미지들
function emojiSrc(emoji: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><text x="15" y="23" font-size="24" text-anchor="middle">${emoji}</text></svg>`;
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
  onMapClick,
  onMouseMove,
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
      <div className="grid h-[600px] place-items-center rounded-xl border text-sm text-red-600">
        지도를 불러오지 못했습니다. 카카오 키/도메인/서비스 활성화를
        확인해주세요.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="grid h-[600px] place-items-center rounded-xl border text-zinc-400">
        지도 불러오는 중…
      </div>
    );
  }

  const markers = elements.filter((e) => e.type !== "zone");
  const zones = elements.filter((e) => e.type === "zone");

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
    <div className="relative" style={{ height: 600 }}>
      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1.5 text-sm text-white shadow">
          {hint}
        </div>
      )}

      <button
        onClick={locate}
        className="absolute right-3 top-3 z-[100] rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow hover:bg-zinc-50"
      >
        📍 내 위치
      </button>

      <Map
        center={center}
        level={level}
        isPanto
        style={{ width: "100%", height: "100%", borderRadius: 12 }}
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
                  className="cursor-pointer whitespace-nowrap rounded bg-white/80 px-1 text-xs font-semibold text-zinc-800"
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
          const image =
            el.type === "icon"
              ? {
                  src: emojiSrc(el.icon ?? "📍"),
                  size: { width: 30, height: 30 },
                  options: { offset: { x: 15, y: 15 } },
                }
              : (() => {
                  const { src, w, h } = labelSrc(el.label, el.color);
                  return {
                    src,
                    size: { width: w, height: h },
                    options: { offset: { x: 2, y: h - 5 } },
                  };
                })();

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
    </div>
  );
}
