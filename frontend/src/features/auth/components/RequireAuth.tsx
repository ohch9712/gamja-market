"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { getLoginPath } from "../redirect";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // 이 화면에서 로그아웃한 경우에는 AuthProvider가 `/`로 보내므로 로그인 화면으로 다시 보내지 않는다.
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (status === "authenticated") {
      wasAuthenticated.current = true;
    } else if (status === "unauthenticated" && !wasAuthenticated.current) {
      router.replace(getLoginPath(pathname));
    }
  }, [status, pathname, router]);

  if (status === "authenticated") return <>{children}</>;

  return (
    <div className="auth-gate" role="status">
      <span className="auth-gate-icon" aria-hidden="true">🥔</span>
      <p>{status === "loading" ? "로그인 상태를 확인하고 있어요…" : "로그인이 필요한 화면이에요. 이동하고 있어요…"}</p>
    </div>
  );
}
