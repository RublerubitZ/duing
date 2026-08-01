import type { ReactNode } from 'react';

import { ExploreNav } from '../_components/ExploreNav';

// 크림 캔버스와 상단 GNB 를 페이지가 아닌 레이아웃에 둔다 — 페이지 안에 있으면 RSC 재페치 중
// 로딩 폴백이 둘을 통째로 걷어가 GNB 가 깜빡이고, 문서 높이가 뷰포트 아래로 붕괴하면서
// 안드로이드 크롬 주소창이 펴져 dvh·safe-area 재계산으로 fixed 하단 탭바가 흔들린다.
// 레이아웃은 로딩 경계 밖이라 재페치 중에도 유지된다((home)·clubs 레이아웃과 동일 구조).
// min-h-dvh(100dvh) 표기도 같은 맥락 — 100vh 는 "주소창이 접힌" 큰 뷰포트를 가리킨다.
export default function TermsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      {children}
    </div>
  );
}
