"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import FilterPanel from "./FilterPanel";
import {
  type MapElement,
  type LatLng,
  ZONE_COLORS,
  boundsFromCorners,
  boundsCenter,
  rectCorners,
  haversine,
  pathCentroid,
} from "@/app/lib/map-types";
import { CATEGORIES, categoryById } from "@/app/lib/categories";

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="map-state-card" role="status">
      <span className="ui-spinner" aria-hidden="true" />
      <span>지도를 불러오는 중입니다.</span>
    </div>
  ),
});

let counter = 0;
const newId = () => `m_${Date.now()}_${counter++}`;

type Mode =
  | { type: "marker"; categoryId: string }
  | { type: "label" }
  | { type: "rect" }
  | { type: "circle" }
  | { type: "polygon" }
  | { type: "line" }
  | null;

type MobilePanel = "tools" | "filters" | "properties" | null;

export type Preview =
  | { type: "rect"; corners: LatLng[] }
  | { type: "circle"; center: LatLng; radius: number }
  | null;

function NavIcon({ name }: { name: "map" | "plus" | "filter" | "edit" }) {
  const paths: Record<typeof name, ReactNode> = {
    map: (
      <>
        <path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    plus: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
    filter: (
      <>
        <path d="M4 6h16M7 12h10M10 18h4" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4l11-11-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
    </div>
  );
}

export default function MapEditor() {
  const [elements, setElements] = useState<MapElement[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [anchor, setAnchor] = useState<LatLng | null>(null);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  const [draft, setDraft] = useState<LatLng[]>([]); // 다각형/선 그리는 중 점들
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);

  const selected = elements.find((element) => element.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    elements.forEach((element) => {
      if (element.type === "marker" && element.categoryId) {
        categoryCounts[element.categoryId] =
          (categoryCounts[element.categoryId] ?? 0) + 1;
      }
    });
    return categoryCounts;
  }, [elements]);

  const markerCount = elements.filter((element) => element.type === "marker").length;
  const zoneCount = elements.filter((element) => element.type === "zone").length;

  const toggleCategory = (id: string) => {
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const completePlacement = (element: Omit<MapElement, "id">) => {
    const id = newId();
    setElements((previous) => [...previous, { ...element, id }]);
    setSelectedId(id);
    setAnchor(null);
    setCursor(null);
    setDraft([]);
    setMode(null);
    setMobilePanel("properties");
  };

  const handleMapClick = (lat: number, lng: number) => {
    const point = { lat, lng };

    if (!mode) {
      setSelectedId(null);
      return;
    }

    if (mode.type === "rect") {
      if (!anchor) {
        setAnchor(point);
        setCursor(point);
      } else {
        const bounds = boundsFromCorners(anchor, point);
        const center = boundsCenter(bounds);
        completePlacement({
          type: "zone",
          shape: "rect",
          bounds,
          lat: center.lat,
          lng: center.lng,
          label: "새 사각 구역",
          color: ZONE_COLORS[0],
        });
      }
      return;
    }

    if (mode.type === "circle") {
      if (!anchor) {
        setAnchor(point);
        setCursor(point);
      } else {
        completePlacement({
          type: "zone",
          shape: "circle",
          radius: Math.max(5, haversine(anchor, point)),
          lat: anchor.lat,
          lng: anchor.lng,
          label: "새 원형 구역",
          color: ZONE_COLORS[0],
        });
      }
      return;
    }

    if (mode.type === "polygon" || mode.type === "line") {
      setDraft((d) => [...d, point]); // 점 추가 (완료는 버튼으로)
      return;
    }

    if (mode.type === "label") {
      completePlacement({
        type: "label",
        lat,
        lng,
        label: "안내 문구",
        color: "#0f172a",
      });
      return;
    }

    completePlacement({
      type: "marker",
      lat,
      lng,
      label: "",
      color: "",
      categoryId: mode.categoryId,
    });
  };

  // 다각형/선 그리기 완료
  const finishDraft = () => {
    if (mode?.type === "polygon") {
      if (draft.length < 3) {
        alert("다각형은 점을 3개 이상 찍어야 합니다.");
        return;
      }
      const c = pathCentroid(draft);
      completePlacement({
        type: "zone",
        shape: "polygon",
        path: draft,
        lat: c.lat,
        lng: c.lng,
        label: "새 구역",
        color: ZONE_COLORS[0],
      });
    } else if (mode?.type === "line") {
      if (draft.length < 2) {
        alert("선은 점을 2개 이상 찍어야 합니다.");
        return;
      }
      const c = pathCentroid(draft);
      completePlacement({
        type: "line",
        path: draft,
        lat: c.lat,
        lng: c.lng,
        label: "경로",
        color: "#2563eb",
      });
    }
    setDraft([]);
  };

  const handleMouseMove = (lat: number, lng: number) => {
    if ((mode?.type === "rect" || mode?.type === "circle") && anchor) {
      setCursor({ lat, lng });
    }
  };

  const cancelDraw = () => {
    setAnchor(null);
    setCursor(null);
    setDraft([]);
    setMode(null);
  };

  const updateElement = (id: string, patch: Partial<MapElement>) => {
    setElements((previous) =>
      previous.map((element) => {
        if (element.id !== id) return element;
        const next = { ...element, ...patch };
        if (next.type === "zone" && next.shape === "rect" && next.bounds) {
          const center = boundsCenter(next.bounds);
          next.lat = center.lat;
          next.lng = center.lng;
        }
        return next;
      }),
    );
  };

  const remove = (id: string) => {
    setElements((previous) => previous.filter((element) => element.id !== id));
    if (selectedId === id) setSelectedId(null);
    setMobilePanel(null);
  };

  const toggleMode = (nextMode: Mode) => {
    setMode((current) => {
      setAnchor(null);
      setCursor(null);
      setDraft([]);
      return JSON.stringify(current) === JSON.stringify(nextMode) ? null : nextMode;
    });
    setMobilePanel(null);
  };

  let preview: Preview = null;
  if (anchor && cursor) {
    if (mode?.type === "rect") {
      preview = {
        type: "rect",
        corners: rectCorners(boundsFromCorners(anchor, cursor)),
      };
    } else if (mode?.type === "circle") {
      preview = { type: "circle", center: anchor, radius: haversine(anchor, cursor) };
    }
  }

  const drawingShape = mode?.type === "rect" || mode?.type === "circle";
  const drawingPath = mode?.type === "polygon" || mode?.type === "line";
  const draftMode: "polygon" | "line" | null =
    mode?.type === "polygon" ? "polygon" : mode?.type === "line" ? "line" : null;
  const hint = drawingShape
    ? anchor
      ? "두 번째 지점을 눌러 구역 크기를 정하세요."
      : mode.type === "rect"
        ? "지도의 첫 번째 모서리를 눌러주세요."
        : "원의 중심을 눌러주세요."
    : drawingPath
      ? mode.type === "polygon"
        ? `다각형: 꼭짓점을 차례로 누른 뒤 완료하세요. (현재 ${draft.length}개)`
        : `선: 경로 지점을 차례로 누른 뒤 완료하세요. (현재 ${draft.length}개)`
      : mode
        ? "지도에서 배치할 위치를 눌러주세요."
        : null;

  const actionButtonClass = (active: boolean) =>
    `ui-touch flex w-full items-center justify-center gap-2 rounded-xl border px-3 text-[15px] font-semibold transition ${
      active
        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
    }`;

  const toolsPanel = (
    <div className="space-y-6">
      <section>
        <SectionTitle
          title="구역 그리기"
          description="사각/원은 두 지점, 다각형은 꼭짓점을 차례로 누릅니다."
        />
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => toggleMode({ type: "rect" })}
            aria-pressed={mode?.type === "rect"}
            className={actionButtonClass(mode?.type === "rect")}
          >
            <span aria-hidden="true" className="text-xl">▭</span>
            사각
          </button>
          <button
            type="button"
            onClick={() => toggleMode({ type: "circle" })}
            aria-pressed={mode?.type === "circle"}
            className={actionButtonClass(mode?.type === "circle")}
          >
            <span aria-hidden="true" className="text-xl">○</span>
            원형
          </button>
          <button
            type="button"
            onClick={() => toggleMode({ type: "polygon" })}
            aria-pressed={mode?.type === "polygon"}
            className={actionButtonClass(mode?.type === "polygon")}
          >
            <span aria-hidden="true" className="text-xl">⬠</span>
            다각형
          </button>
        </div>
      </section>

      <section>
        <SectionTitle
          title="선 · 경로"
          description="지점을 이어 경로를 그리면 총 거리가 표시됩니다."
        />
        <button
          type="button"
          onClick={() => toggleMode({ type: "line" })}
          aria-pressed={mode?.type === "line"}
          className={actionButtonClass(mode?.type === "line")}
        >
          <span aria-hidden="true" className="text-xl">📏</span>
          선 / 거리 측정
        </button>
      </section>

      {drawingPath && (
        <button
          type="button"
          onClick={finishDraft}
          className="ui-touch w-full rounded-xl border border-blue-600 bg-blue-600 px-3 text-[15px] font-semibold text-white shadow-sm"
        >
          그리기 완료 ({draft.length}개 점)
        </button>
      )}

      <section>
        <SectionTitle title="시설 마커" description="종류를 고른 다음 지도에서 위치를 누릅니다." />
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((category) => {
            const active = mode?.type === "marker" && mode.categoryId === category.id;
            return (
              <button
                type="button"
                key={category.id}
                onClick={() => toggleMode({ type: "marker", categoryId: category.id })}
                aria-pressed={active}
                className={`${actionButtonClass(active)} justify-start`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm"
                  style={{ backgroundColor: active ? "rgba(255,255,255,.2)" : category.color }}
                >
                  {category.icon}
                </span>
                {category.name}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle title="안내 문구" />
        <button
          type="button"
          onClick={() => toggleMode({ type: "label" })}
          aria-pressed={mode?.type === "label"}
          className={actionButtonClass(mode?.type === "label")}
        >
          <span aria-hidden="true" className="text-lg font-black">T</span>
          지도에 텍스트 추가
        </button>
      </section>

      {mode && (
        <button type="button" onClick={cancelDraw} className="ui-secondary-button w-full">
          현재 작업 취소
        </button>
      )}
    </div>
  );

  const propertiesPanel = !selected ? (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-500 shadow-sm">
        <NavIcon name="edit" />
      </div>
      <p className="mt-4 font-bold text-slate-900">선택된 요소가 없습니다</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        지도에서 마커나 구역을 누르면 이름과 색상을 수정할 수 있습니다.
      </p>
    </div>
  ) : (
    <div className="space-y-5">
      <div className="rounded-2xl bg-blue-50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">선택 항목</p>
        <p className="mt-1 text-base font-bold text-slate-950">
          {selected.type === "zone"
            ? "구역"
            : selected.type === "line"
              ? "선 · 경로"
              : selected.type === "label"
                ? "안내 문구"
                : `${categoryById(selected.categoryId)?.name ?? "시설"} 마커`}
        </p>
      </div>

      {selected.type === "marker" && (
        <div>
          <SectionTitle title="시설 종류" />
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="시설 종류 선택">
            {CATEGORIES.map((category) => {
              const active = selected.categoryId === category.id;
              return (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => updateElement(selected.id, { categoryId: category.id })}
                  aria-pressed={active}
                  className={`ui-touch flex items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <span aria-hidden="true">{category.icon}</span>
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="block">
        <span className="ui-label">표시 이름</span>
        <input
          value={selected.label}
          placeholder={selected.type === "marker" ? "예: 메인 무대" : "이름 입력"}
          onChange={(event) => updateElement(selected.id, { label: event.target.value })}
          className="ui-input mt-2"
        />
      </label>

      {(selected.type === "zone" ||
        selected.type === "label" ||
        selected.type === "line") && (
        <div>
          <SectionTitle title="표시 색상" />
          <div className="flex flex-wrap gap-2" role="group" aria-label="표시 색상 선택">
            {ZONE_COLORS.map((color, index) => (
              <button
                type="button"
                key={color}
                onClick={() => updateElement(selected.id, { color })}
                aria-label={`색상 ${index + 1}`}
                aria-pressed={selected.color === color}
                className={`h-11 w-11 rounded-xl border-2 transition ${
                  selected.color === color
                    ? "border-blue-700 ring-2 ring-blue-200"
                    : "border-white ring-1 ring-slate-300"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => remove(selected.id)}
        className="ui-touch w-full rounded-xl border border-red-200 bg-red-50 px-4 font-bold text-red-700 hover:bg-red-100"
      >
        선택 항목 삭제
      </button>
    </div>
  );

  const mobilePanelTitle =
    mobilePanel === "tools"
      ? "배치 요소 추가"
      : mobilePanel === "filters"
        ? "지도 필터"
        : "선택 항목 편집";

  return (
    <div className="pb-24 md:pb-0">
      <section className="mb-4 grid grid-cols-3 gap-2 md:mb-6 md:max-w-xl md:gap-3" aria-label="배치도 현황">
        <div className="ui-stat-card">
          <strong>{elements.length}</strong>
          <span>전체 요소</span>
        </div>
        <div className="ui-stat-card">
          <strong>{markerCount}</strong>
          <span>시설 마커</span>
        </div>
        <div className="ui-stat-card">
          <strong>{zoneCount}</strong>
          <span>행사 구역</span>
        </div>
      </section>

      {hint && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-900 md:hidden">
          <span aria-hidden="true" className="mt-0.5">●</span>
          <span>{hint}</span>
          <button type="button" onClick={cancelDraw} className="ml-auto shrink-0 underline underline-offset-4">
            취소
          </button>
        </div>
      )}

      <div className="editor-layout">
        <aside className="ui-panel hidden self-start p-5 lg:block" aria-label="배치 요소 추가">
          {toolsPanel}
        </aside>

        <section className="min-w-0" aria-label="축제 배치도 지도">
          <div className="ui-panel overflow-hidden p-2 sm:p-3">
            <div className="mb-2 flex items-center gap-2 px-1 sm:mb-3">
              <div className="relative min-w-0 flex-1">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <label htmlFor="map-quick-search" className="sr-only">배치도 빠른 검색</label>
                <input
                  id="map-quick-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="시설 이름 검색"
                  className="ui-input pl-12"
                />
              </div>
              <button
                type="button"
                onClick={() => setMobilePanel("filters")}
                className="ui-icon-button lg:hidden"
                aria-label="필터 열기"
              >
                <NavIcon name="filter" />
                {hidden.size > 0 && (
                  <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                    {hidden.size}
                  </span>
                )}
              </button>
            </div>

            <MapCanvas
              elements={elements}
              hint={hint}
              preview={preview}
              draft={draft}
              draftMode={draftMode}
              selectedId={selectedId}
              hiddenCategories={[...hidden]}
              query={search}
              onMapClick={handleMapClick}
              onMouseMove={handleMouseMove}
              onFinishDraw={finishDraft}
              onCancelDraw={cancelDraw}
              onUpdate={updateElement}
              onSelect={(id) => {
                setSelectedId(id);
                setMobilePanel("properties");
              }}
            />
          </div>

          <div className="mt-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
            <strong className="text-slate-950">사용 방법:</strong> 아래의 <b>추가</b> 메뉴에서 시설이나 구역을 고른 뒤 지도 위치를 누르세요. 배치한 항목을 다시 누르면 이름과 색상을 편집할 수 있습니다.
          </div>
        </section>

        <div className="hidden space-y-4 lg:block">
          <FilterPanel
            hidden={hidden}
            onToggle={toggleCategory}
            search={search}
            onSearch={setSearch}
            counts={counts}
          />
          <aside className="ui-panel p-5" aria-label="선택 항목 속성">
            <SectionTitle title="속성 편집" />
            {propertiesPanel}
          </aside>
        </div>
      </div>

      <nav className="mobile-bottom-nav lg:hidden" aria-label="배치도 주요 메뉴">
        <button
          type="button"
          onClick={() => setMobilePanel(null)}
          className={mobilePanel === null ? "is-active" : ""}
          aria-current={mobilePanel === null ? "page" : undefined}
        >
          <NavIcon name="map" />
          <span>지도</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("tools")}
          className={mobilePanel === "tools" ? "is-active" : ""}
          aria-current={mobilePanel === "tools" ? "page" : undefined}
        >
          <NavIcon name="plus" />
          <span>추가</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("filters")}
          className={mobilePanel === "filters" ? "is-active" : ""}
          aria-current={mobilePanel === "filters" ? "page" : undefined}
        >
          <span className="relative">
            <NavIcon name="filter" />
            {hidden.size > 0 && <span className="mobile-nav-dot" />}
          </span>
          <span>필터</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("properties")}
          className={mobilePanel === "properties" ? "is-active" : ""}
          aria-current={mobilePanel === "properties" ? "page" : undefined}
        >
          <span className="relative">
            <NavIcon name="edit" />
            {selected && <span className="mobile-nav-dot" />}
          </span>
          <span>편집</span>
        </button>
      </nav>

      {mobilePanel && (
        <div className="mobile-sheet-layer lg:hidden" role="dialog" aria-modal="true" aria-label={mobilePanelTitle}>
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setMobilePanel(null)}
            aria-label="패널 닫기"
          />
          <section className="mobile-sheet">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" aria-hidden="true" />
            <header className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">새김 배치도</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{mobilePanelTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setMobilePanel(null)}
                className="ui-icon-button"
                aria-label="패널 닫기"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            {mobilePanel === "tools" && toolsPanel}
            {mobilePanel === "filters" && (
              <FilterPanel
                hidden={hidden}
                onToggle={toggleCategory}
                search={search}
                onSearch={setSearch}
                counts={counts}
                compact
              />
            )}
            {mobilePanel === "properties" && propertiesPanel}
          </section>
        </div>
      )}
    </div>
  );
}
