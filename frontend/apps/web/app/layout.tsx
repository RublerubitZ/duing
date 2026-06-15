import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from './_components/BottomNav';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Du-ing 두잉',
  description: '대구대학교 동아리 통합 플랫폼',
};

// 모바일 뷰포트 기반 — viewport-fit=cover 로 세이프에어리어(env(safe-area-inset-*)) 전제를 켜고,
// themeColor 는 크림 캔버스(#F6F3EC)에 맞춰 모바일 브라우저 UI 톤을 통일한다.
// maximumScale 은 두지 않는다(확대 허용 — 접근성). width/initialScale 은 Next 기본과 동일하게 명시.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F6F3EC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 폰트 CDN(cdn.jsdelivr.net — Pretendard·GmarketSans) 연결을 미리 맺어
            globals.css 의 @import·@font-face 가 실행될 때 DNS·TLS 왕복을 절약한다.
            웹폰트는 CORS(anonymous) 요청이라 preconnect 도 crossOrigin 이어야 커넥션이 재사용된다.
            dns-prefetch 는 preconnect 미지원 브라우저용 폴백. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <BottomNav />
      </body>
    </html>
  );
}
