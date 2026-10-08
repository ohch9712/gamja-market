import Link from "next/link";
import { RequestExplorer } from "@/features/purchase-requests/components/RequestExplorer";
import { getPurchaseRequests } from "@/features/purchase-requests/api";
import { categoryLabels, type RequestFilters } from "@/features/purchase-requests/utils";
import type { Category } from "@/types/purchase-request";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const requests = await getPurchaseRequests();
  const params = await searchParams;
  const category = typeof params.category === "string" ? params.category : "all";
  const initialFilters: RequestFilters = {
    query: typeof params.q === "string" ? params.q : "",
    category: category === "all" || Object.hasOwn(categoryLabels, category)
      ? (category as Category | "all")
      : "all",
    status: params.status === "all" ? "all" : "open",
  };
  const openCount = requests.filter((request) => request.status === "open").length;

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="hero-tag"><span aria-hidden="true">✳</span> 구매자가 먼저 시작하는 거래</span>
            <h1>찾는 물건을<br /><em>먼저 말해보세요.</em></h1>
            <p>원하는 물건과 가격을 알려주면, 가지고 있는 이웃이 찾아와요. 기다리던 거래를 조금 더 쉽게 시작해 보세요.</p>
            <div className="hero-actions">
              <Link href="/requests/new" className="button button-primary button-large">구매요청 올리기 <span aria-hidden="true">↗</span></Link>
              <a href="#listing-title" className="button button-text">요청 둘러보기 <span aria-hidden="true">↓</span></a>
            </div>
            <div className="hero-note"><span className="hero-note-avatars" aria-hidden="true"><i>🥔</i><i>✿</i><i>★</i></span><span>지금 <strong>{openCount}개의 요청</strong>이 이웃을 기다려요</span></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-art-glow" />
            <div className="hero-art-note hero-art-note-top">원하는 물건을 올리면 <span>✦</span></div>
            <div className="hero-art-card">
              <div className="hero-art-card-top"><span className="hero-art-badge">구해요</span><span>•••</span></div>
              <div className="hero-art-product"><span>⌘</span></div>
              <div className="hero-art-line short" /><div className="hero-art-line" />
              <div className="hero-art-price">700,000원 ~ 900,000원</div>
            </div>
            <div className="hero-art-note hero-art-note-bottom"><span>♥</span> 이웃이 찾아와요!</div>
            <div className="hero-art-spark hero-art-spark-one">✳</div>
            <div className="hero-art-spark hero-art-spark-two">✦</div>
          </div>
        </div>
      </section>
      <RequestExplorer requests={requests} initialFilters={initialFilters} now={new Date().toISOString()} />
    </>
  );
}
