"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import type { AuthUser, Credentials, SignupInput } from "@/types/auth";
import * as authApi from "./api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  backendAvailable: boolean; // getMe가 NETWORK_ERROR·TIMEOUT이면 false
  signup(input: SignupInput): Promise<void>;
  login(credentials: Credentials): Promise<void>;
  logout(): Promise<void>;
}

type AuthState = Pick<AuthContextValue, "status" | "user" | "backendAvailable">;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, backendAvailable: true });
  // signup/login/logout이 끝나면 증가한다. 그보다 늦게 도착한 최초 getMe 결과가 상태를 덮어쓰지 않게 한다.
  const versionRef = useRef(0);

  useEffect(() => {
    let active = true;
    const version = versionRef.current;
    const isCurrent = () => active && versionRef.current === version;
    authApi.getMe().then(
      (user) => {
        if (!isCurrent()) return;
        setState(user
          ? { status: "authenticated", user, backendAvailable: true }
          : { status: "unauthenticated", user: null, backendAvailable: true });
      },
      (error: unknown) => {
        if (!isCurrent()) return;
        // 확인에 실패하면(타임아웃 포함) 미로그인으로 보고 로그인·회원가입 진입점을 유지한다.
        const unreachable = error instanceof ApiError && (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT");
        setState({ status: "unauthenticated", user: null, backendAvailable: !unreachable });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const user = await authApi.signup(input);
    versionRef.current += 1;
    setState({ status: "authenticated", user, backendAvailable: true });
  }, []);

  const login = useCallback(async (credentials: Credentials) => {
    const user = await authApi.login(credentials);
    versionRef.current += 1;
    setState({ status: "authenticated", user, backendAvailable: true });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // 서버 응답과 무관하게 화면은 로그아웃 상태로 바꾼다.
    }
    versionRef.current += 1;
    setState((current) => ({ ...current, status: "unauthenticated", user: null }));
    router.push("/");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signup, login, logout }),
    [state, signup, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  return context;
}
