import Link from "next/link";

export default function NotFound() {
  return (
    <div className="not-found-page container"><div className="not-found-art" aria-hidden="true">🥔<span>?</span></div><span className="eyebrow">404 · PAGE NOT FOUND</span><h1>찾으시는 페이지가 없어요</h1><p>주소가 잘못되었거나, 더 이상 볼 수 없는 구매요청일 수 있어요.</p><Link href="/" className="button button-primary button-large">요청 목록으로 돌아가기 <span aria-hidden="true">↗</span></Link></div>
  );
}
