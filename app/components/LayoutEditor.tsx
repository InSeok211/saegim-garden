"use client";

import { useRef, useState } from "react";
import {
  type LayoutElement,
  CANVAS_W,
  CANVAS_H,
  ZONE_COLORS,
  ICON_SET,
} from "@/app/lib/layout-types";

// 요소마다 겹치지 않는 id 생성
let counter = 0;
const newId = () => `el_${Date.now()}_${counter++}`;

// 선택 시 나타나는 네 모서리 핸들 정의
const HANDLES: { pos: string; style: React.CSSProperties; cursor: string }[] = [
  { pos: "nw", style: { left: -6, top: -6 }, cursor: "nwse-resize" },
  { pos: "ne", style: { right: -6, top: -6 }, cursor: "nesw-resize" },
  { pos: "sw", style: { left: -6, bottom: -6 }, cursor: "nesw-resize" },
  { pos: "se", style: { right: -6, bottom: -6 }, cursor: "nwse-resize" },
];

export default function LayoutEditor() {
  const [elements, setElements] = useState<LayoutElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 배경 이미지(선택). src 는 data URL, opacity 는 0~1 투명도.
  const [bg, setBg] = useState<{ src: string; opacity: number } | null>(null);

  // 드래그 이동 상태
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // 크기 조절 상태
  const resize = useRef<{
    id: string;
    handle: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const selected = elements.find((el) => el.id === selectedId) ?? null;

  // ── 요소 추가 ──────────────────────────────────────────────
  const addElement = (el: Omit<LayoutElement, "id">) => {
    const id = newId();
    setElements((prev) => [...prev, { ...el, id }]);
    setSelectedId(id); // 추가하면 바로 선택
  };

  const addZone = () =>
    addElement({
      type: "zone",
      x: CANVAS_W / 2 - 90,
      y: CANVAS_H / 2 - 50,
      w: 180,
      h: 100,
      label: "구역 이름",
      color: ZONE_COLORS[0],
    });

  const addText = () =>
    addElement({
      type: "text",
      x: CANVAS_W / 2 - 40,
      y: CANVAS_H / 2,
      w: 120,
      h: 32,
      label: "텍스트",
      color: "#111827",
      fontSize: 20,
    });

  const addIcon = (icon: string) =>
    addElement({
      type: "icon",
      x: CANVAS_W / 2 - 20,
      y: CANVAS_H / 2 - 20,
      w: 40,
      h: 40,
      label: "",
      color: "",
      icon,
    });

  // ── 선택 요소 수정 / 삭제 ─────────────────────────────────
  const updateSelected = (patch: Partial<LayoutElement>) => {
    if (!selectedId) return;
    setElements((prev) =>
      prev.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)),
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  // ── 드래그 이동 (포인터 이벤트) ───────────────────────────
  const onElementPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    el: LayoutElement,
  ) => {
    e.stopPropagation(); // 캔버스 클릭(선택 해제)으로 번지지 않도록
    setSelectedId(el.id);
    drag.current = {
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onElementPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setElements((prev) =>
      prev.map((el) =>
        el.id === d.id
          ? { ...el, x: Math.round(d.origX + dx), y: Math.round(d.origY + dy) }
          : el,
      ),
    );
  };

  const onElementPointerUp = () => {
    drag.current = null;
  };

  // ── 크기 조절 (모서리 핸들) ───────────────────────────────
  const onHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    el: LayoutElement,
    handle: string,
  ) => {
    e.stopPropagation(); // 핸들 조작이 이동으로 이어지지 않도록
    resize.current = {
      id: el.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.w,
      origH: el.h,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resize.current;
    if (!r) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;

    let nx = r.origX;
    let ny = r.origY;
    let nw = r.origW;
    let nh = r.origH;

    // 어느 모서리를 잡았는지에 따라 너비/높이/좌표를 조정
    if (r.handle.includes("e")) nw = Math.max(20, r.origW + dx);
    if (r.handle.includes("s")) nh = Math.max(20, r.origH + dy);
    if (r.handle.includes("w")) {
      nw = Math.max(20, r.origW - dx);
      nx = r.origX + (r.origW - nw); // 왼쪽 모서리를 당기면 x도 같이 이동
    }
    if (r.handle.includes("n")) {
      nh = Math.max(20, r.origH - dy);
      ny = r.origY + (r.origH - nh);
    }

    setElements((prev) =>
      prev.map((el) =>
        el.id === r.id
          ? {
              ...el,
              x: Math.round(nx),
              y: Math.round(ny),
              w: Math.round(nw),
              h: Math.round(nh),
            }
          : el,
      ),
    );
  };

  const onHandlePointerUp = () => {
    resize.current = null;
  };

  // 선택된 요소의 네 모서리 핸들 렌더링 (zone/icon 만)
  const renderHandles = (el: LayoutElement) =>
    HANDLES.map((h) => (
      <div
        key={h.pos}
        onPointerDown={(e) => onHandlePointerDown(e, el, h.pos)}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        className="absolute z-10 h-3 w-3 rounded-full border border-blue-500 bg-white"
        style={{ ...h.style, cursor: h.cursor }}
      />
    ));

  // ── 배경 이미지 ───────────────────────────────────────────
  const onBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 파일을 data URL(문자열)로 읽어 배경으로 설정
    const reader = new FileReader();
    reader.onload = () => setBg({ src: reader.result as string, opacity: 1 });
    reader.readAsDataURL(file);
    e.target.value = ""; // 같은 파일을 다시 골라도 동작하도록 초기화
  };

  return (
    <div className="flex gap-4">
      {/* ── 왼쪽: 팔레트 ─────────────────────────────── */}
      <aside className="w-40 shrink-0 space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-500">추가</h3>
          <div className="space-y-2">
            <button
              onClick={addZone}
              className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              ＋ 구역
            </button>
            <button
              onClick={addText}
              className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              ＋ 텍스트
            </button>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-500">아이콘</h3>
          <div className="grid grid-cols-4 gap-1">
            {ICON_SET.map((ic) => (
              <button
                key={ic}
                onClick={() => addIcon(ic)}
                title="클릭하면 캔버스에 추가"
                className="aspect-square rounded border text-lg hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-500">배경</h3>
          <label className="block w-full cursor-pointer rounded-lg border px-3 py-2 text-center text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
            이미지 올리기
            <input
              type="file"
              accept="image/*"
              onChange={onBgUpload}
              className="hidden"
            />
          </label>

          {bg && (
            <div className="mt-2 space-y-2">
              <label className="block text-xs text-zinc-500">
                투명도: {Math.round(bg.opacity * 100)}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={bg.opacity * 100}
                  onChange={(e) =>
                    setBg({ ...bg, opacity: Number(e.target.value) / 100 })
                  }
                  className="mt-1 w-full"
                />
              </label>
              <button
                onClick={() => setBg(null)}
                className="w-full rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                배경 제거
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-400">
          요소를 드래그해 옮기고, 선택하면 모서리로 크기를 조절할 수 있어요.
        </p>
      </aside>

      {/* ── 가운데: 캔버스 ───────────────────────────── */}
      <div className="flex-1 overflow-auto rounded-xl border border-zinc-300 dark:border-zinc-700">
        <div
          className="relative touch-none select-none bg-zinc-50 dark:bg-zinc-900"
          style={{ width: CANVAS_W, height: CANVAS_H }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {/* 배경 이미지 — 요소들보다 뒤(z-0), 클릭 방해 안 하도록 pointer-events 없음 */}
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bg.src}
              alt="배경"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{ opacity: bg.opacity }}
            />
          )}

          {elements.map((el) => {
            const isSel = el.id === selectedId;
            const ring = isSel
              ? "outline outline-2 outline-blue-500"
              : "outline-none";

            if (el.type === "zone") {
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => onElementPointerDown(e, el)}
                  onPointerMove={onElementPointerMove}
                  onPointerUp={onElementPointerUp}
                  className={`absolute flex cursor-move items-center justify-center rounded-lg text-center text-sm font-medium text-zinc-800 ${ring}`}
                  style={{
                    left: el.x,
                    top: el.y,
                    width: el.w,
                    height: el.h,
                    backgroundColor: el.color,
                  }}
                >
                  {el.label}
                  {isSel && renderHandles(el)}
                </div>
              );
            }

            if (el.type === "text") {
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => onElementPointerDown(e, el)}
                  onPointerMove={onElementPointerMove}
                  onPointerUp={onElementPointerUp}
                  className={`absolute cursor-move whitespace-nowrap rounded px-1 font-bold ${ring}`}
                  style={{
                    left: el.x,
                    top: el.y,
                    color: el.color,
                    fontSize: el.fontSize,
                  }}
                >
                  {el.label}
                </div>
              );
            }

            // el.type === "icon"
            return (
              <div
                key={el.id}
                onPointerDown={(e) => onElementPointerDown(e, el)}
                onPointerMove={onElementPointerMove}
                onPointerUp={onElementPointerUp}
                className={`absolute grid cursor-move place-items-center rounded ${ring}`}
                style={{
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  height: el.h,
                  fontSize: Math.min(el.w, el.h) * 0.7,
                }}
              >
                {el.icon}
                {isSel && renderHandles(el)}
              </div>
            );
          })}

          {elements.length === 0 && !bg && (
            <div className="pointer-events-none grid h-full place-items-center text-zinc-400">
              왼쪽 팔레트에서 요소를 추가하거나 배경 이미지를 올려보세요
            </div>
          )}
        </div>
      </div>

      {/* ── 오른쪽: 속성 패널 ────────────────────────── */}
      <aside className="w-56 shrink-0">
        <h3 className="mb-2 text-sm font-semibold text-zinc-500">속성</h3>
        {!selected ? (
          <p className="text-sm text-zinc-400">
            요소를 선택하면 여기서 편집할 수 있어요.
          </p>
        ) : (
          <div className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            {/* 이름(zone/text) */}
            {(selected.type === "zone" || selected.type === "text") && (
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-500">이름</span>
                <input
                  value={selected.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            )}

            {/* 색 (zone 배경 / text 글자색) */}
            {(selected.type === "zone" || selected.type === "text") && (
              <div className="text-sm">
                <span className="mb-1 block text-zinc-500">색</span>
                <div className="mb-2 flex flex-wrap gap-1">
                  {ZONE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateSelected({ color: c })}
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
                  onChange={(e) => updateSelected({ color: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
                />
              </div>
            )}

            {/* 글자 크기(text) */}
            {selected.type === "text" && (
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-500">
                  글자 크기: {selected.fontSize}px
                </span>
                <input
                  type="range"
                  min={10}
                  max={64}
                  value={selected.fontSize ?? 20}
                  onChange={(e) =>
                    updateSelected({ fontSize: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
            )}

            {/* 크기(zone/icon) — 숫자로도 조절 가능 */}
            {(selected.type === "zone" || selected.type === "icon") && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-zinc-500">너비</span>
                  <input
                    type="number"
                    min={20}
                    value={selected.w}
                    onChange={(e) =>
                      updateSelected({ w: Math.max(20, Number(e.target.value)) })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-zinc-500">높이</span>
                  <input
                    type="number"
                    min={20}
                    value={selected.h}
                    onChange={(e) =>
                      updateSelected({ h: Math.max(20, Number(e.target.value)) })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>
            )}

            <button
              onClick={deleteSelected}
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
