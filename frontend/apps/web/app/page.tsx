import { HomeFooter } from './_components/HomeFooter';
import { HomeNav } from './_components/HomeNav';
import { BannerCarousel } from './_components/sections/BannerCarousel';
import { Categories } from './_components/sections/Categories';
import { FeaturedClubs } from './_components/sections/FeaturedClubs';
import { HomeHero } from './_components/sections/HomeHero';
import { LeaderCta } from './_components/sections/LeaderCta';
import { RecruitmentTicker } from './_components/sections/RecruitmentTicker';

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
