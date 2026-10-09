import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuthProvider } from "@/features/auth/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "감자마켓 | 찾는 사람이 먼저 시작하는 거래", template: "%s | 감자마켓" },
  description: "찾는 물건과 희망 가격을 올리면, 이웃이 먼저 판매를 제안하는 구매자 중심 동네 거래 플랫폼.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <Header />
          <main id="main-content">{children}</main>
        </AuthProvider>
        <Footer />
      </body>
    </html>
  );
}
