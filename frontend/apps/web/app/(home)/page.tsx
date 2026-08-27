import type { Metadata } from 'next';

import { FadeIn } from '@/components/motion/FadeIn';

import { HomeFooter } from '../_components/HomeFooter';
import { BannerCarousel } from '../_components/sections/BannerCarousel';
import { Categories } from '../_components/sections/Categories';
import { HomeHero } from '../_components/sections/HomeHero';
import { HomeMobileSearchBar } from '../_components/sections/HomeMobileSearchBar';
import { InterestingClubs } from '../_components/sections/InterestingClubs';
import { RecruitmentTicker } from '../_components/sections/RecruitmentTicker';

// 홈(/)은 검색 대표 페이지 — 자기참조 canonical 로 대표 URL/제목 신호를 명확히 한다.
// openGraph·title 등 나머지 메타데이터는 RootLayout 에서 상속한다(여기서 openGraph 를 재정의하면
// Next 의 shallow-merge 로 layout 의 og:site_name 이 통째로 덮여 사라지므로 canonical 만 추가한다).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// 홈은 전 섹션이 공개 데이터(모집 목록·통계·배너·활동 피드·관심도 집계)라 라우트째 ISR 로 캐시한다(#925).
// TTL 600s 근거(3차 Active CPU 감사): 프로덕션 serverless 실행의 대부분이 ISR 재생성이고, uptime
// 봇(60s)이 TTL 을 상시 포화시켜 재생성 주기가 곧 Active CPU 고정비의 상한이다 — 300→600 상향으로
// 그 고정비를 절반으로 줄인다. 가장 엄격한 freshness 요구는 "모집 오픈/마감·배너 게시가 홈에
// 보이기까지"인데, 홈은 발견성 표면이라 10분 지연을 수용한다(클라 라우터 캐시도 3분 stale 허용해 온
// 데이터다). 되돌릴 땐 재생성 고정비가 배가되는 것을 감수할 것.
// 관심도 순위는 서버 배치가 매시 갱신하므로 이 TTL 안에서 최대 한 시간 늦게 반영된다 — 발견성
// 표면이라 수용한다(카드에 찍히는 주간 인원도 같은 주기다).
// 데이터 로더(home-data·public-activities)는 빌드 국면에서 실패 시 폴백(fail-soft)이라
// BE 없는 CI 빌드도 통과하고(빈 섹션으로 프리렌더), Vercel 빌드는 실 API 로 실데이터를 박는다.
// 반대로 런타임(=재생성) 실패는 rethrow 해 직전 캐시본을 유지한다 — swallow 하면 재생성이
// "성공" 처리돼 빈 홈이 600초 캐시된다(app/_lib/fail-soft.ts).
// club-stats 만 예외로 전 국면 fail-soft(null) 유지 — 홈 단독 소비가 아니라 login/signup
// (같은 600초 ISR)도 쓰기 때문에, rethrow 하면 우아한 열화(문구 생략) 대신 빌드 실패(빌드 국면)나
// 재생성 실패(런타임 — 직전 캐시본 유지)가 된다.
// 홈에서 club-stats 만 단독 실패하면 통계 문구가 빠질 뿐이라(빈 홈 아님) 감수 가능하다.
// ⚠️ 불변식: 이 라우트(레이아웃 포함)에서 cookies()/headers() 를 읽는 순간 다시 dynamic 이 된다 —
// 개인화(인증 상태·알림)는 클라이언트 전용으로 유지할 것.
export const revalidate = 600;

// GNB(HomeNav)·크림 캔버스 래퍼는 (home)/layout.tsx 가 렌더한다 — 로딩 경계 밖에서 유지되도록.
// 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky 면 라우터 자동 스크롤 기준에서 제외되어
// dev 콘솔에 Skipping auto-scroll 경고가 뜬다(layout-router shouldSkipElement).
export default function HomePage() {
  return (
    <div>
      <HomeHero />
      {/* 모바일 검색 바는 시안대로 히어로 다음에 온다. sticky 라 이 자리에 있다가 지나치면 상단에 붙는다 —
          히어로 섹션 안에 넣으면 섹션을 벗어나는 순간 함께 사라져 스크롤 중 검색을 잃는다. */}
      <HomeMobileSearchBar />
      <BannerCarousel />
      <RecruitmentTicker />
      {/* 발견 흐름의 중심 섹션 — 탐색·카테고리보다 먼저 두어, 스크롤 초반에 "지금 볼 만한 곳" 을 먼저 만나게 한다.
          모바일 뷰포트 첫 화면에 걸치는 above-the-fold 콘텐츠라 FadeIn(초기 opacity:0)으로 감싸지 않는다. */}
      <InterestingClubs />
      <FadeIn>
        <Categories />
      </FadeIn>
      <HomeFooter />
    </div>
  );
}
