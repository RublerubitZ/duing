import type { Metadata, Viewport } from 'next';
import { ViewTransitions } from 'next-view-transitions';
import './globals.css';
import { BottomNav } from './_components/BottomNav';
import { Providers } from './providers';
import { SITE_URL } from './_lib/site';

const SITE_NAME = '두잉';
const SITE_TITLE = '두잉 | 대구대학교 동아리 플랫폼';
const SITE_DESCRIPTION = '대구대학교 동아리 통합 플랫폼';

// 검색결과의 "사이트 이름"·"제목" 을 두잉으로 고정하기 위한 구조화 데이터(JSON-LD).
// WebSite.name / og:site_name 이 없으면 Google 이 사이트 이름을 도메인(duings.com)으로 추론한다.
// 여러 타입(WebSite·Organization)은 @graph 로 묶어 모든 처리기가 두 노드를 함께 읽도록 한다.
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: SITE_NAME,
      alternateName: 'Du-ing',
      url: `${SITE_URL}/`,
      inLanguage: 'ko-KR',
    },
    {
      '@type': 'Organization',
      name: SITE_NAME,
      alternateName: 'Du-ing',
      url: `${SITE_URL}/`,
      // logo 는 webp 포맷을 명시한 ImageObject 로 둬 일부 크롤러가 포맷을 추론 못해 누락하는 일을 막는다.
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/duing-logo.webp`,
        encodingFormat: 'image/webp',
      },
    },
  ],
};

export const metadata: Metadata = {
  // 상대 경로 메타데이터(canonical·og:url)를 절대 URL 로 해석하는 기준 도메인.
  metadataBase: new URL(SITE_URL),
  // 각 페이지가 이미 제목에 "두잉" 을 직접 포함하는 컨벤션이라(예: /terms, /introduce),
  // title.template 으로 "| 두잉" 을 덧붙이면 접미사가 중복된다 → 평문 제목을 기본값으로만 둔다.
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    locale: 'ko_KR',
    // 소셜 공유 미리보기 이미지 — public/og-image.png(1731×909, ≈1.9:1 = 1200×630 비율).
    // metadataBase 로 절대 URL(https://duings.com/og-image.png) 로 렌더돼 카카오톡/페북이 읽는다.
    images: [{ url: '/og-image.png', width: 1731, height: 909, alt: SITE_TITLE }],
  },
  twitter: {
    // 1200×630 비율 이미지가 있으므로 큰 이미지 카드로 노출한다.
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
  },
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
          {/* 검색엔진용 구조화 데이터(JSON-LD) — 사이트 이름/조직 정보를 명시해 검색결과 사이트명을 두잉으로 고정한다.
              type="application/ld+json" 은 실행 스크립트가 아닌 데이터 블록이며, 정적 상수만 직렬화하고
              '<' 를 이스케이프해 `</script>` 조기 종료(인젝션)를 차단한다. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, '\\u003c'),
            }}
          />
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
