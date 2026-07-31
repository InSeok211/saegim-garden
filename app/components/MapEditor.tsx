"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  type MapElement,
  type LatLng,
  ICON_SET,
  ZONE_COLORS,
  boundsFromCorners,
  boundsCenter,
  rectCorners,
  haversine,
} from "@/app/lib/map-types";

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[600px] place-items-center rounded-xl border text-zinc-400">
      지도 불러오는 중…
    </div>
  ),
});

let counter = 0;
const newId = () => `m_${Date.now()}_${counter++}`;

type Mode =
  | { type: "icon"; icon: string }
  | { type: "label" }
  | { type: "rect" }
  | { type: "circle" }
  | null;

// MapCanvas 로 넘길 미리보기 도형
export type Preview =
  | { type: "rect"; corners: LatLng[] }
  | { type: "circle"; center: LatLng; radius: number }
  | null;

export default function MapEditor() {
  const [elements, setElements] = useState<MapElement[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [anchor, setAnchor] = useState<LatLng | null>(null); // 도형 첫 클릭점
  const [cursor, setCursor] = useState<LatLng | null>(null); // 미리보기용 현재 마우스
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const addZone = (z: Omit<MapElement, "id">) => {
    const id = newId();
    setElements((p) => [...p, { ...z, id }]);
    setSelectedId(id);
    setAnchor(null);
    setCursor(null);
    setMode(null);
  };

  // 지도 클릭
  const handleMapClick = (lat: number, lng: number) => {
    const pt = { lat, lng };
    if (!mode) {
      setSelectedId(null);
      return;
    }

    if (mode.type === "rect") {
      if (!anchor) {
        setAnchor(pt); // 첫 모서리
        setCursor(pt);
      } else {
        const b = boundsFromCorners(anchor, pt);
        const c = boundsCenter(b);
        const label = window.prompt("구역 이름을 입력하세요", "구역") || "구역";
        addZone({
          type: "zone",
          shape: "rect",
          bounds: b,
          lat: c.lat,
          lng: c.lng,
          label,
          color: ZONE_COLORS[0],
        });
      }
      return;
    }

    if (mode.type === "circle") {
      if (!anchor) {
        setAnchor(pt); // 중심
        setCursor(pt);
      } else {
        const radius = Math.max(5, haversine(anchor, pt));
        const label = window.prompt("구역 이름을 입력하세요", "구역") || "구역";
        addZone({
          type: "zone",
          shape: "circle",
          radius,
          lat: anchor.lat,
          lng: anchor.lng,
          label,
          color: ZONE_COLORS[0],
        });
      }
      return;
    }

    if (mode.type === "label") {
      const text = window.prompt("표시할 텍스트를 입력하세요", "텍스트");
      if (text === null) {
        setMode(null);
        return;
      }
      const id = newId();
      setElements((p) => [
        ...p,
        { id, type: "label", lat, lng, label: text || "텍스트", color: "#111827" },
      ]);
      setSelectedId(id);
      setMode(null);
      return;
    }

    // icon
    const id = newId();
    setElements((p) => [
      ...p,
      { id, type: "icon", lat, lng, label: "", color: "", icon: mode.icon },
    ]);
    setSelectedId(id);
    setMode(null);
  };

  // 미리보기 갱신용 마우스 이동
  const handleMouseMove = (lat: number, lng: number) => {
    if ((mode?.type === "rect" || mode?.type === "circle") && anchor) {
      setCursor({ lat, lng });
    }
  };

  const cancelDraw = () => {
    setAnchor(null);
    setCursor(null);
    setMode(null);
  };

  // 요소 갱신(마커 이동 / 도형 크기·이동). bounds 가 바뀌면 중심도 다시 계산.
  const updateElement = (id: string, patch: Partial<MapElement>) => {
    setElements((p) =>
      p.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...patch };
        if (next.type === "zone" && next.shape === "rect" && next.bounds) {
          const c = boundsCenter(next.bounds);
          next.lat = c.lat;
          next.lng = c.lng;
        }
        return next;
      }),
    );
  };

  const remove = (id: string) => {
    setElements((p) => p.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const toggleMode = (m: Mode) =>
    setMode((cur) => {
      setAnchor(null);
      setCursor(null);
      return JSON.stringify(cur) === JSON.stringify(m) ? null : m;
    });

  // 미리보기 계산
  let preview: Preview = null;
  if (anchor && cursor) {
    if (mode?.type === "rect") {
      preview = { type: "rect", corners: rectCorners(boundsFromCorners(anchor, cursor)) };
    } else if (mode?.type === "circle") {
      preview = { type: "circle", center: anchor, radius: haversine(anchor, cursor) };
    }
  }

  const drawing = mode?.type === "rect" || mode?.type === "circle";
  const hint = drawing
    ? anchor
      ? "반대편 지점을 클릭해 크기를 정하세요"
      : mode?.type === "rect"
        ? "사각형의 한쪽 모서리를 클릭하세요"
        : "원의 중심을 클릭하세요"
    : mode
      ? "지도를 클릭해 배치하세요"
      : null;

  const shapeBtn = (active: boolean) =>
    `flex-1 rounded-lg border px-2 py-2 text-sm ${
      active
        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
        : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
    }`;

  return (
    <div className="flex gap-4">
      {/* ── 왼쪽: 팔레트 ── */}
      <aside className="w-44 shrink-0 space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-500">구역</h3>
          <div className="flex gap-2">
            <button
              onClick={() => toggleMode({ type: "rect" })}
              className={shapeBtn(mode?.type === "rect")}
            >
              ▭ 사각형
            </button>
            <button
              onClick={() => toggleMode({ type: "circle" })}
              className={shapeBtn(mode?.type === "circle")}
            >
              ◯ 원
            </button>
          </div>
          {drawing && (
            <button
              onClick={cancelDraw}
              className="mt-2 w-full rounded-lg border px-3 py-1.5 text-sm"
            >
              그리기 취소
            </button>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-500">추가</h3>
          <button
            onClick={() => toggleMode({ type: "label" })}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${
              mode?.type === "label"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            ＋ 텍스트
          </button>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-500">아이콘</h3>
          <div className="grid grid-cols-4 gap-1">
            {ICON_SET.map((ic) => (
              <button
                key={ic}
                onClick={() => toggleMode({ type: "icon", icon: ic })}
                className={`aspect-square rounded border text-lg ${
                  mode?.type === "icon" && mode.icon === ic
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-zinc-400">
          도형을 그린 뒤 선택하면 모서리 핸들로 크기를 조절할 수 있어요.
        </p>
      </aside>

      {/* ── 가운데: 지도 ── */}
      <div className="flex-1">
        <MapCanvas
          elements={elements}
          armed={!!mode}
          hint={hint}
          preview={preview}
          selectedId={selectedId}
          onMapClick={handleMapClick}
          onMouseMove={handleMouseMove}
          onUpdate={updateElement}
          onSelect={setSelectedId}
        />
      </div>

      {/* ── 오른쪽: 속성 패널 ── */}
      <aside className="w-56 shrink-0">
        <h3 className="mb-2 text-sm font-semibold text-zinc-500">속성</h3>
        {!selected ? (
          <p className="text-sm text-zinc-400">
            요소(마커/구역)를 클릭하면 편집할 수 있어요.
          </p>
        ) : (
          <div className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-400">
              {selected.type === "zone"
                ? "구역"
                : selected.type === "label"
                  ? "텍스트"
                  : "아이콘"}
            </p>

            {(selected.type === "zone" || selected.type === "label") && (
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-500">이름</span>
                <input
                  value={selected.label}
                  onChange={(e) => updateElement(selected.id, { label: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            )}

            {(selected.type === "zone" || selected.type === "label") && (
              <div className="text-sm">
                <span className="mb-1 block text-zinc-500">색</span>
                <div className="mb-2 flex flex-wrap gap-1">
                  {ZONE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateElement(selected.id, { color: c })}
                      className={`h-6 w-6 rounded-full border ${
                        selected.color === c
                          ? "ring-2 ring-blue-500 ring-offset-1"
                          : ""
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={selected.color}
                  onChange={(e) => updateElement(selected.id, { color: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
                />
              </div>
            )}

            <button
              onClick={() => remove(selected.id)}
              className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              삭제
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
