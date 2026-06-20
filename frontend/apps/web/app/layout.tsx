import type { Metadata, Viewport } from 'next';
import { ViewTransitions } from 'next-view-transitions';
import './globals.css';
import { BottomNav } from './_components/BottomNav';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: '두잉 | 대구대학교 동아리 플랫폼',
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
    // ViewTransitions: App Router 네비게이션을 document.startViewTransition 으로 감싸
    // 전역 크로스페이드 + 공유요소(동아리 로고) 모핑을 활성화한다. 미지원 브라우저는 즉시 이동.
    <ViewTransitions>
      <html lang="ko" suppressHydrationWarning>
        <head>
          {/* 폰트는 self-host(/public/fonts) — globals.css 의 @font-face 로 로드한다.
              전역 본문 폰트인 Pretendard 가변본만 preload 해 초기 렌더의 폰트 스왑(FOUT)을 줄인다.
              폰트는 same-origin 이라도 CORS 로 페치되므로 preload 에 crossOrigin 이 필요하다. */}
          <link
            rel="preload"
            href="/fonts/PretendardVariable.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        </head>
        <body>
          <Providers>{children}</Providers>
          <BottomNav />
        </body>
      </html>
    </ViewTransitions>
  );
}
