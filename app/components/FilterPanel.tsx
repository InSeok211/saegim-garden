"use client";

import { CATEGORIES } from "@/app/lib/categories";

type Props = {
  hidden: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  counts: Record<string, number>;
  compact?: boolean;
};

export default function FilterPanel({
  hidden,
  onToggle,
  search,
  onSearch,
  counts,
  compact = false,
}: Props) {
  return (
    <div className={compact ? "space-y-4" : "ui-panel space-y-5 p-5"}>
      <div>
        <label htmlFor={compact ? "mobile-map-search" : "desktop-map-search"} className="ui-label">
          배치도 검색
        </label>
        <div className="relative mt-2">
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
          <input
            id={compact ? "mobile-map-search" : "desktop-map-search"}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="이름 또는 카테고리"
            className="ui-input pl-12"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="ui-label m-0">표시할 시설</h3>
          <span className="text-sm font-medium text-slate-500">
            {CATEGORIES.length - hidden.size}/{CATEGORIES.length}
          </span>
        </div>

        <div className="space-y-2" role="group" aria-label="시설 카테고리 표시 설정">
          {CATEGORIES.map((category) => {
            const isVisible = !hidden.has(category.id);
            const count = counts[category.id] ?? 0;

            return (
              <button
                type="button"
                key={category.id}
                onClick={() => onToggle(category.id)}
                aria-pressed={isVisible}
                className={`ui-touch flex w-full items-center gap-3 rounded-xl border px-3 text-left transition ${
                  isVisible
                    ? "border-slate-200 bg-white text-slate-900"
                    : "border-slate-200 bg-slate-100 text-slate-500"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base"
                  style={{ backgroundColor: category.color }}
                >
                  {category.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{category.name}</span>
                  <span className="block text-xs text-slate-500">등록 {count}개</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    isVisible ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${
                      isVisible ? "left-6" : "left-1"
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
