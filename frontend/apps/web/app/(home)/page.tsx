import type { Metadata } from 'next';

import { FadeIn } from '@/components/motion/FadeIn';

import { HomeFooter } from '../_components/HomeFooter';
import { BannerCarousel } from '../_components/sections/BannerCarousel';
import { Categories } from '../_components/sections/Categories';
import { FeaturedClubs } from '../_components/sections/FeaturedClubs';
import { HomeHero } from '../_components/sections/HomeHero';
import { HomeMobileSearchBar } from '../_components/sections/HomeMobileSearchBar';
import { HomeQnaSection } from '../_components/sections/HomeQnaSection';
import { LeaderCta } from '../_components/sections/LeaderCta';
import { RecruitmentTicker } from '../_components/sections/RecruitmentTicker';

// 홈(/)은 검색 대표 페이지 — 자기참조 canonical 로 대표 URL/제목 신호를 명확히 한다.
// openGraph·title 등 나머지 메타데이터는 RootLayout 에서 상속한다(여기서 openGraph 를 재정의하면
// Next 의 shallow-merge 로 layout 의 og:site_name 이 통째로 덮여 사라지므로 canonical 만 추가한다).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// 홈은 전 섹션이 공개 데이터(모집 목록·통계·배너·활동 피드·FAQ)라 라우트째 ISR 로 캐시한다(#925).
// TTL 300s 근거: 가장 엄격한 freshness 요구는 "모집 오픈/마감·배너 게시가 홈에 보이기까지"인데,
// 홈은 발견성 표면이라 5분 지연을 수용한다(클라 라우터 캐시도 이미 3분 stale 을 허용해 온 데이터다).
// 60s 로 낮추면 재생성(=서버리스 실행)이 5배 늘어 invocation 절감이라는 목적이 무뎌진다.
// 데이터 로더(home-data·public-activities)는 빌드 국면에서 실패 시 폴백(fail-soft)이라
// BE 없는 CI 빌드도 통과하고(빈 섹션으로 프리렌더), Vercel 빌드는 실 API 로 실데이터를 박는다.
// 반대로 런타임(=재생성) 실패는 rethrow 해 직전 캐시본을 유지한다 — swallow 하면 재생성이
// "성공" 처리돼 빈 홈이 300초 캐시된다(app/_lib/fail-soft.ts).
// club-stats 만 예외로 전 국면 fail-soft(null) 유지 — 홈 단독 소비가 아니라 login/signup
// (force-dynamic)도 쓰기 때문에, rethrow 하면 그 두 페이지가 우아한 열화 대신 500 이 된다.
// 홈에서 club-stats 만 단독 실패하면 통계 문구가 빠질 뿐이라(빈 홈 아님) 감수 가능하다.
// ⚠️ 불변식: 이 라우트(레이아웃 포함)에서 cookies()/headers() 를 읽는 순간 다시 dynamic 이 된다 —
// 개인화(인증 상태·알림)는 클라이언트 전용으로 유지할 것.
export const revalidate = 300;

// GNB(HomeNav)·크림 캔버스 래퍼는 (home)/layout.tsx 가 렌더한다 — 로딩 경계 밖에서 유지되도록.
// 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky(검색바)면 라우터 자동 스크롤 기준에서
// 제외되어 dev 콘솔에 Skipping auto-scroll 경고가 뜬다(layout-router shouldSkipElement).
export default function HomePage() {
  return (
    <div>
      <HomeMobileSearchBar />
      <HomeHero />
      <BannerCarousel />
      <RecruitmentTicker />
      {/* 모바일 뷰포트 첫 화면에 걸치는 above-the-fold 콘텐츠 — FadeIn(초기 opacity:0) 언랩 */}
      <Categories />
      <FadeIn>
        <FeaturedClubs />
      </FadeIn>
      <FadeIn>
        <HomeQnaSection />
      </FadeIn>
      {/* 운영자용 동아리 등록 CTA — 모바일에선 숨기고 md+ 에서만 노출 */}
      <FadeIn className="hidden md:block">
        <LeaderCta />
      </FadeIn>
      <HomeFooter />
    </div>
  );
}
