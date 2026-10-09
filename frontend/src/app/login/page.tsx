import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { getSafeRedirectPath } from "@/features/auth/redirect";

export const metadata: Metadata = { title: "로그인" };

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const redirectTo = getSafeRedirectPath(typeof next === "string" ? next : undefined);

  return (
    <div className="page-surface">
      <div className="container auth-page">
        <div className="auth-card">
          <div className="page-intro auth-intro"><span className="eyebrow">LOG IN</span><h1>로그인</h1><p>다시 만나서 반가워요. 이메일로 로그인해 주세요.</p></div>
          <LoginForm redirectTo={redirectTo} />
          <p className="auth-switch">아직 계정이 없나요? <Link href="/signup">회원가입</Link></p>
        </div>
      </div>
    </div>
  );
}
