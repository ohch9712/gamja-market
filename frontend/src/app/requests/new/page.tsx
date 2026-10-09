import type { Metadata } from "next";
import Link from "next/link";
import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { RequestForm } from "@/features/purchase-requests/components/RequestForm";

export const metadata: Metadata = { title: "구매요청 올리기" };

export default function NewRequestPage() {
  return (
    <div className="page-surface">
      <div className="container form-page">
        <Link href="/" className="back-link">← 목록으로 돌아가기</Link>
        <div className="page-intro"><span className="eyebrow">NEW REQUEST</span><h1>찾는 물건을 알려주세요</h1><p>원하는 조건을 적으면, 이웃에게 보여줄 구매요청이 준비돼요.</p></div>
        <div className="form-layout">
          <RequireAuth>
            <RequestForm />
          </RequireAuth>
          <aside className="form-aside">
            <div className="aside-potato" aria-hidden="true">🥔</div>
            <span className="aside-kicker">좋은 요청을 위한 팁</span>
            <h2>구체적으로 적을수록<br />딱 맞는 물건을 만나요.</h2>
            <ul><li>모델명이나 크기를 제목에 적어주세요.</li><li>원하는 상태를 스펙으로 나눠 적어주세요.</li><li>거래 가능한 가격대를 알려주세요.</li></ul>
            <p>현재는 화면 체험 단계예요. 실제 등록은 3단계에서 연결됩니다.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
