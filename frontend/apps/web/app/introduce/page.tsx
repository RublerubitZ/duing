import type { Metadata } from 'next';
import { HomeFooter } from '../_components/HomeFooter';
import { HomeNav } from '../_components/HomeNav';
import { Audiences } from './_components/sections/Audiences';
import { BeforeAfter } from './_components/sections/BeforeAfter';
import { Cta } from './_components/sections/Cta';
import { Faq } from './_components/sections/Faq';
import { Features } from './_components/sections/Features';
import { Flow } from './_components/sections/Flow';
import { Hero } from './_components/sections/Hero';
import { Problem } from './_components/sections/Problem';
import { Solution } from './_components/sections/Solution';

export const metadata: Metadata = {
  title: '두잉 | 대구대학교 동아리 플랫폼',
  description:
    '대구대학교 동아리 운영의 새로운 기준. 모집·공지·회비·멤버 관리까지 두잉 하나로.',
};

export default function IntroducePage() {
  return (
    // overflow-x-clip: 스크롤 등장 모션(가로 슬라이드)이 모바일에서 가로 스크롤을 만들지 않도록 클립.
    <div className="duing min-h-dvh overflow-x-clip bg-cream">
      {/* 모바일에선 글로벌 링크를 슬림화 — 소개 페이지는 자체 CTA(둘러보기·등록)가 주 동선. */}
      <HomeNav slimOnMobile />
      {/* 스토리 흐름: 문제 인식 → 공감(흩어진 도구) → 소개 → 기능 → 운영진 혜택 → 운영 흐름 → 신뢰 → 가입 */}
      <Hero />
      <Problem />
      <BeforeAfter />
      <Solution />
      <Features />
      <Audiences />
      <Flow />
      <Faq />
      <Cta />
      <HomeFooter />
    </div>
  );
}
