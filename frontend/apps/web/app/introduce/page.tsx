import type { Metadata } from 'next';
import { HomeNav } from '../_components/HomeNav';
import { PromoFooter } from './_components/PromoFooter';
import { Cta } from './_components/sections/Cta';
import { Faq } from './_components/sections/Faq';
import { Features } from './_components/sections/Features';
import { Hero } from './_components/sections/Hero';
import { Problem } from './_components/sections/Problem';
import { Stats } from './_components/sections/Stats';

export const metadata: Metadata = {
  title: '두잉 — 대구대학교 동아리, 하나로',
  description:
    '대구대학교 학생자치회 공식 동아리 플랫폼 두잉(Duing). 동아리 탐색부터 지원, 운영까지 한 곳에서.',
};

export default function IntroducePage() {
  return (
    <div className="duing min-h-screen" style={{ background: '#f3efe4' }}>
      <HomeNav />
      <Hero />
      <Stats />
      <Problem />
      <Features />
      <Faq />
      <Cta />
      <PromoFooter />
    </div>
  );
}
