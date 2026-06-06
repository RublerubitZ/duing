import { HomeFooter } from './_components/HomeFooter';
import { HomeNav } from './_components/HomeNav';
import { BannerCarousel } from './_components/sections/BannerCarousel';
import { Categories } from './_components/sections/Categories';
import { FeaturedClubs } from './_components/sections/FeaturedClubs';
import { HomeHero } from './_components/sections/HomeHero';
import { LeaderCta } from './_components/sections/LeaderCta';
import { RecruitmentTicker } from './_components/sections/RecruitmentTicker';

// HomeHero / FeaturedClubs / RecruitmentTicker 가 서버 컴포넌트에서 백엔드 API 를 호출하므로
// 빌드 타임 prerender 를 막아 런타임에 fetch 가 실행되도록 한다. CI 환경에 BE 가 없어도 빌드 통과.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="duing min-h-screen bg-cream">
      <HomeNav />
      <HomeHero />
      <BannerCarousel />
      <RecruitmentTicker />
      <Categories />
      <FeaturedClubs />
      <LeaderCta />
      <HomeFooter />
    </div>
  );
}
