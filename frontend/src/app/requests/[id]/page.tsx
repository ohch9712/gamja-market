import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchaseRequest } from "@/features/purchase-requests/api";
import { CategoryVisual } from "@/features/purchase-requests/components/CategoryVisual";
import { StatusBadge } from "@/features/purchase-requests/components/StatusBadge";
import { categoryLabels, formatPriceRange, formatRelativeTime } from "@/features/purchase-requests/utils";

type DetailPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: DetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const request = await getPurchaseRequest(id);
  return { title: request?.title ?? "구매요청을 찾을 수 없어요" };
}

export default async function RequestDetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const request = await getPurchaseRequest(id);
  if (!request) notFound();

  return (
    <div className="page-surface">
      <div className="container detail-page">
        <Link href="/" className="back-link">← 목록으로 돌아가기</Link>
        <div className="detail-layout">
          <div className="detail-main">
            <CategoryVisual category={request.category} large />
            <div className="detail-heading">
              <div className="detail-kicker"><span>{categoryLabels[request.category]}</span><span aria-hidden="true">·</span><time dateTime={request.createdAt}>{formatRelativeTime(request.createdAt)}</time></div>
              <h1>{request.title}</h1>
              <StatusBadge status={request.status} />
            </div>
            <section className="detail-section" aria-labelledby="description-title"><h2 id="description-title">이런 물건을 찾고 있어요</h2><p className="detail-description">{request.description}</p></section>
            <section className="detail-section" aria-labelledby="specs-title"><h2 id="specs-title">원하는 스펙</h2>{request.specs.length > 0 ? <ul className="spec-tags">{request.specs.map((spec) => <li key={spec}>{spec}</li>)}</ul> : <p className="muted-text">등록된 스펙이 없어요.</p>}</section>
          </div>
          <aside className="detail-sidebar" aria-label="구매요청 정보">
            <div className="detail-price-card"><span className="detail-price-label">희망 가격대</span><strong>{formatPriceRange(request.minPrice, request.maxPrice)}</strong><div className="detail-info-row"><span>거래 희망 지역</span><b>{request.location}</b></div><div className="detail-info-row"><span>작성자</span><b>{request.buyerNickname}</b></div><div className="detail-info-row"><span>판매 지원</span><b>{request.applicationCount}명</b></div><button type="button" className="button button-primary detail-apply" disabled>판매 지원하기</button><p className="coming-soon">판매 지원 기능은 준비 중이에요.</p></div>
            <div className="detail-help"><span aria-hidden="true">✦</span><p>내가 가진 물건인가요?<br />판매 지원 기능이 곧 열릴 예정이에요.</p></div>
          </aside>
        </div>
      </div>
    </div>
  );
}
