import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/features/auth/components/SignupForm";

export const metadata: Metadata = { title: "회원가입" };

export default function SignupPage() {
  return (
    <div className="page-surface">
      <div className="container auth-page">
        <div className="auth-card">
          <div className="page-intro auth-intro"><span className="eyebrow">SIGN UP</span><h1>회원가입</h1><p>이메일과 비밀번호만 있으면 바로 시작할 수 있어요.</p></div>
          <SignupForm />
          <p className="auth-switch">이미 계정이 있나요? <Link href="/login">로그인</Link></p>
        </div>
      </div>
    </div>
  );
}
