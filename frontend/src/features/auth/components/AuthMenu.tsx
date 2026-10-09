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

  if (status === "loading") {
    return <div className="auth-menu auth-menu-placeholder" aria-hidden="true" data-testid="auth-menu-loading" />;
  }

  if (status === "authenticated" && user) {
    return (
      <div className="auth-menu">
        <span className="auth-email" title={user.email}>{user.email}</span>
        <button type="button" className="button button-text auth-link" onClick={handleLogout} disabled={loggingOut}>로그아웃</button>
      </div>
    );
  }

  return (
    <div className="auth-menu">
      <Link href="/login" className="button button-text auth-link">로그인</Link>
      <Link href="/signup" className="button button-text auth-link">회원가입</Link>
    </div>
  );
}
