"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/app/lib/firebase";
import { ALLOWED_EMAILS } from "@/app/lib/auth-config";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAllowed: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 로그인 상태가 바뀔 때마다 감지
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const login = async () => {
    // 팝업이 이미 열려 있으면 중복 실행 방지
    if (loading) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // 사용자가 팝업을 닫거나 중복 클릭한 경우는 정상 상황이므로 무시
      if (
        code === "auth/cancelled-popup-request" ||
        code === "auth/popup-closed-by-user"
      ) {
        return;
      }
      console.error("로그인 실패:", err);
      alert("로그인에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const isAllowed = !!user?.email && ALLOWED_EMAILS.includes(user.email);

  return (
    <AuthContext.Provider value={{ user, loading, isAllowed, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다");
  return ctx;
}
