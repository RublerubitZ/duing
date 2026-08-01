import type { ReactNode } from 'react';

import { ExploreNav } from '../_components/ExploreNav';

// 크림 캔버스와 상단 GNB 를 페이지가 아닌 레이아웃에 둔다 — 페이지 안에 있으면 RSC 재페치 중
// 로딩 폴백이 둘을 통째로 걷어가 GNB 가 깜빡이고, 문서 높이가 뷰포트 아래로 붕괴하면서
// 안드로이드 크롬 주소창이 펴져 dvh·safe-area 재계산으로 fixed 하단 탭바가 흔들린다.
// 레이아웃은 로딩 경계 밖이라 재페치 중에도 유지된다((home)·clubs 레이아웃과 동일 구조).
// min-h-lvh(주소창 접힌 큰 뷰포트) — 공지처럼 콘텐츠가 한 화면이면 dvh 문서의 스크롤 여유가
// 하단 탭바 스페이서 56px 뿐이라, 안드로이드 크롬이 주소창·chin 을 접은 채 유지하는
// 임계(뷰포트+브라우저 컨트롤 높이)에 못 미친다 → 정보 탭 진입마다 컨트롤이 강제로 펴지며
// env(safe-area-inset-bottom)·뷰포트가 바뀌어 하단 탭바의 높이·배경 띠가 다른 탭과 달라 보인다.
// lvh 는 문서를 항상 그 임계 위로 띄워 다른 탭(콘텐츠가 lvh 를 넘는)과 동일 기하로 만든다.
// InfoTabs 는 공지 상세 미노출 정책이라 레이아웃이 아닌 각 허브 페이지가 렌더한다.
export default function NoticesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-lvh bg-cream">
      <ExploreNav slimOnMobile />
      {children}
    </div>
  );
}
