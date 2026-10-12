"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthProvider";

export function AuthMenu() {
  const { status, user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  if (status === "authenticated" && user) {
    return (
      <div className="auth-menu">
        <span className="auth-email" title={user.email}>{user.email}</span>
        <button type="button" className="button button-text auth-link" onClick={handleLogout} disabled={loggingOut}>로그아웃</button>
      </div>
    );
  }

  // 로그인 상태 확인 중(loading)에도 진입점을 숨기지 않는다. 백엔드 응답이 늦어도 로그인·회원가입으로 갈 수 있어야 한다.
  return (
    <div className="auth-menu" aria-busy={status === "loading"} data-auth-status={status}>
      <Link href="/login" className="button button-text auth-link">로그인</Link>
      <Link href="/signup" className="button button-text auth-link">회원가입</Link>
    </div>
  );
}
