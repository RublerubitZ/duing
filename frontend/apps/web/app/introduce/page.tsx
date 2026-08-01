import type { Metadata } from 'next';
import { HomeFooter } from '../_components/HomeFooter';
import { InfoTabs } from '../_components/InfoTabs';
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
    // 크림 캔버스(duing min-h-dvh overflow-x-clip bg-cream)와 ExploreNav 는 introduce/layout.tsx 가 렌더한다 — 로딩 경계 밖에서 유지되도록.
    // 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky(InfoTabs)면 라우터 자동 스크롤 기준에서 제외된다.
    <div>
      <InfoTabs />
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
