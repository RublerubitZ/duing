import type { ReactNode } from 'react';

import { HomeNav } from '../_components/HomeNav';

// 홈 상단 GNB 를 페이지가 아닌 레이아웃에 둔다 — 홈은 force-dynamic 이라 탭 재방문 시
// RSC 페치가 도는데, 헤더가 페이지 안에 있으면 로딩 폴백 동안 헤더째 사라져 깜빡인다.
// 레이아웃은 로딩 경계 밖이므로 페치 중에도 GNB 가 유지된다(clubs/facilities 레이아웃과 동일 구조).
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <HomeNav slimOnMobile />
      {children}
    </div>
  );
}
