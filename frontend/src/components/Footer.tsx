import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <Link href="/" className="footer-brand">🥔 감자마켓</Link>
          <p>찾는 사람이 먼저 시작하는 동네 거래</p>
        </div>
        <span>© {new Date().getFullYear()} 감자마켓</span>
      </div>
    </footer>
  );
}
