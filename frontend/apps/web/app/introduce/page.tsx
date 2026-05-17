import type { Metadata } from 'next';
import { PromoFooter } from './_components/PromoFooter';
import { PromoNav } from './_components/PromoNav';
import { Audiences } from './_components/sections/Audiences';
import { Cta } from './_components/sections/Cta';
import { Faq } from './_components/sections/Faq';
import { Features } from './_components/sections/Features';
import { Hero } from './_components/sections/Hero';
import { HowItWorks } from './_components/sections/HowItWorks';
import { Problem } from './_components/sections/Problem';
import { Solution } from './_components/sections/Solution';
import { Stats } from './_components/sections/Stats';
import { Testimonials } from './_components/sections/Testimonials';

export const metadata: Metadata = {
  title: '두잉 — 대구대학교 동아리, 하나로',
  description:
    '대구대학교 학생자치회 공식 동아리 플랫폼 두잉(Duing). 동아리 탐색부터 지원, 운영까지 한 곳에서.',
};

export default function IntroducePage() {
  return (
    <div className="duing min-h-screen bg-cream">
      <PromoNav />
      <Hero />
      <Stats />
      <Problem />
      <Solution />
      <Features />
      <HowItWorks />
      <Audiences />
      <Testimonials />
      <Faq />
      <Cta />
      <PromoFooter />
    </div>
  );
}
