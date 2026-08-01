import MapEditor from "./components/MapEditor";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-8 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10">
      <header className="mb-6 md:mb-8">
        <div className="mb-3 inline-flex min-h-8 items-center rounded-full bg-blue-50 px-3 text-sm font-bold text-blue-800">
          모바일 우선 행사 운영 도구
        </div>
        <div className="max-w-3xl">
          <h1 className="text-[28px] font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-4xl">
            새김 축제 배치도 편집기
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-600 sm:text-base">
            행사 구역과 주요 시설을 지도 위에 배치하고, 모바일에서도 손쉽게 수정할 수 있습니다.
          </p>
        </div>
      </header>

      <MapEditor />
    </main>
  );
}
