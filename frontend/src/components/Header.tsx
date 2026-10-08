import Link from "next/link";

export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="감자마켓 홈">
          <span className="brand-mark" aria-hidden="true">🥔</span>
          <span>감자마켓</span>
        </Link>
        <nav aria-label="주 메뉴">
          <Link href="/requests/new" className="button button-primary header-cta">
            <span className="header-cta-plus" aria-hidden="true">＋</span>
            구매요청 올리기
          </Link>
        </nav>
      </div>
    </header>
  );
}
