import type { Metadata } from 'next';

import { FadeIn } from '@/components/motion/FadeIn';

import { HomeFooter } from './_components/HomeFooter';
import { HomeNav } from './_components/HomeNav';
import { BannerCarousel } from './_components/sections/BannerCarousel';
import { Categories } from './_components/sections/Categories';
import { FeaturedClubs } from './_components/sections/FeaturedClubs';
import { HomeHero } from './_components/sections/HomeHero';
import { HomeMobileSearchBar } from './_components/sections/HomeMobileSearchBar';
import { LeaderCta } from './_components/sections/LeaderCta';
import { RecruitmentTicker } from './_components/sections/RecruitmentTicker';

// 홈(/)은 검색 대표 페이지 — 자기참조 canonical 로 대표 URL/제목 신호를 명확히 한다.
// openGraph·title 등 나머지 메타데이터는 RootLayout 에서 상속한다(여기서 openGraph 를 재정의하면
// Next 의 shallow-merge 로 layout 의 og:site_name 이 통째로 덮여 사라지므로 canonical 만 추가한다).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// HomeHero / FeaturedClubs / RecruitmentTicker 가 서버 컴포넌트에서 백엔드 API 를 호출하므로
// 빌드 타임 prerender 를 막아 런타임에 fetch 가 실행되도록 한다. CI 환경에 BE 가 없어도 빌드 통과.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="duing min-h-dvh bg-cream">
      <HomeNav slimOnMobile />
      <HomeMobileSearchBar />
      <HomeHero />
      <BannerCarousel />
      <RecruitmentTicker />
      <FadeIn>
        <Categories />
      </FadeIn>
      <FadeIn>
        <FeaturedClubs />
      </FadeIn>
      {/* 운영자용 동아리 등록 CTA — 모바일에선 숨기고 md+ 에서만 노출 */}
      <FadeIn className="hidden md:block">
        <LeaderCta />
      </FadeIn>
      <HomeFooter />
    </div>
  );
}
