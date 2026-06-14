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
      <body>
        <Providers>{children}</Providers>
        <BottomNav />
      </body>
    </html>
  );
}
