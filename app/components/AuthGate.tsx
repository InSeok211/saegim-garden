"use client";

import { useAuth } from "./AuthProvider";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, isAllowed, login, logout } = useAuth();

  if (loading) {
    return (
      <main className="grid flex-1 place-items-center text-zinc-500">
        로딩 중…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid flex-1 place-items-center">
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold">새김 배치도</h1>
          <p className="text-zinc-500">계속하려면 로그인하세요.</p>
          <button
            onClick={login}
            className="rounded-lg bg-black px-5 py-2.5 text-white dark:bg-white dark:text-black"
          >
            구글로 로그인
          </button>
        </div>
      </main>
    );
  }

  if (!isAllowed) {
    return (
      <main className="grid flex-1 place-items-center">
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold">접근 권한이 없습니다</h1>
          <p className="text-zinc-500">
            <b>{user.email}</b> 계정은 사용 권한이 없습니다.
          </p>
          <button onClick={logout} className="rounded-lg border px-5 py-2.5">
            로그아웃
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
