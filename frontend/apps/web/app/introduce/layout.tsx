import type { ReactNode } from 'react';

import { ExploreNav } from '../_components/ExploreNav';

// 크림 캔버스와 상단 GNB 를 페이지가 아닌 레이아웃에 둔다 — 페이지 안에 있으면 RSC 재페치 중
// 로딩 폴백이 둘을 통째로 걷어가 GNB 가 깜빡이고, 문서 높이가 뷰포트 아래로 붕괴하면서
// 안드로이드 크롬 주소창이 펴져 dvh·safe-area 재계산으로 fixed 하단 탭바가 흔들린다.
// 레이아웃은 로딩 경계 밖이라 재페치 중에도 유지된다((home)·clubs 레이아웃과 동일 구조).
// ExploreNav 사용: pathname 기반 active 로 정보 메뉴에 밑줄이 잡힌다(HomeNav 는 홈 고정 active).
// slimOnMobile: 소개 페이지는 자체 CTA(둘러보기·등록)가 주 동선이라 모바일에선 글로벌 링크를 슬림화한다.
// overflow-x-clip: 스크롤 등장 모션(가로 슬라이드)이 모바일에서 가로 스크롤을 만들지 않도록 클립.
// min-h-lvh: 콘텐츠가 한 화면일 때도 문서를 "주소창 접힌 뷰포트" 위로 띄워 안드로이드 크롬
// 브라우저 컨트롤 개폐로 하단 탭바가 다른 탭과 달라 보이는 것을 막는다(notices/layout.tsx 참조).
export default function IntroduceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-lvh max-md:min-h-[calc(100lvh+3.5rem)] overflow-x-clip bg-cream">
      <ExploreNav slimOnMobile />
      {children}
    </div>
  );
}
