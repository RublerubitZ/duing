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
  title: '두잉 | 대구대학교 동아리 플랫폼',
  description:
    '대구대학교 학생자치회 공식 동아리 플랫폼 두잉(Duing). 동아리 탐색부터 지원, 운영까지 한 곳에서.',
};

export default function IntroducePage() {
  return (
    <div className="duing min-h-dvh" style={{ background: '#f3efe4' }}>
      {/* 모바일에선 글로벌 링크를 슬림화 — 좁은 폭에서 5개 링크가 글자단위로 깨지던 문제 해소.
          소개 페이지는 자체 CTA(둘러보기·등록)가 주 동선이라 링크 슬림이 적절. */}
      <HomeNav slimOnMobile />
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
