import type { Metadata } from 'next';
import { HomeFooter } from '../_components/HomeFooter';
import { HomeNav } from '../_components/HomeNav';
import { BeforeAfter } from './_components/sections/BeforeAfter';
import { Cta } from './_components/sections/Cta';
import { Faq } from './_components/sections/Faq';
import { Features } from './_components/sections/Features';
import { Flow } from './_components/sections/Flow';
import { Hero } from './_components/sections/Hero';
import { Problem } from './_components/sections/Problem';
import { Solution } from './_components/sections/Solution';
import { StudentExperience } from './_components/sections/StudentExperience';

export const metadata: Metadata = {
  title: '두잉 | 대구대학교 동아리 플랫폼',
  description:
    '대구대학교 동아리 플랫폼 두잉. 관심 있는 동아리를 찾아 지원하고, 모집·공지·회비 운영까지 한 곳에서.',
};

export default function IntroducePage() {
  return (
    // overflow-x-clip: 스크롤 등장 모션(가로 슬라이드)이 모바일에서 가로 스크롤을 만들지 않도록 클립.
    <div className="duing min-h-dvh overflow-x-clip bg-cream">
      {/* 모바일에선 글로벌 링크를 슬림화 — 소개 페이지는 자체 CTA(둘러보기·등록)가 주 동선. */}
      <HomeNav slimOnMobile />
      {/* 스토리 흐름: (학생) 동아리 찾기 → 공감 → 소개 → 탐색 경험 → (운영진) 운영 전환 → 운영 기능 → 사용 흐름 → 신뢰 → 가입 */}
      <Hero />
      <Problem />
      <Solution />
      <StudentExperience />
      <BeforeAfter />
      <Features />
      <Flow />
      <Faq />
      <Cta />
      <HomeFooter />
    </div>
  );
}
