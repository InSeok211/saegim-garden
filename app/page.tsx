import MapEditor from "./components/MapEditor";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">새김 배치도 편집기</h1>
      </header>

      <MapEditor />
    </main>
  );
}
