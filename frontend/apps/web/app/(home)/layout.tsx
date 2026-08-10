import type { ReactNode } from 'react';

import { HomeNav } from '../_components/HomeNav';

// 홈 상단 GNB 를 페이지가 아닌 레이아웃에 둔다 — 탭 재방문 RSC 페치 중에도 로딩 경계 밖이라
// 헤더가 유지된다(clubs/facilities 레이아웃과 동일 구조).
//
// 인증 상태(auth_hint)는 여기서 읽지 않는다(#925) — cookies() 를 읽으면 라우트가 dynamic 이 돼
// 홈 ISR(page.tsx revalidate) 이 깨진다. 헤더 인증 UI 는 다른 정적 라우트와 동일하게 클라이언트
// 시드(§9.2 로컬 이력 → AuthSessionBootstrap 서버 확인)로 결정된다. 정적 HTML 은 항상 미인증
// 슬롯으로 그려지고 하이드레이션 커밋에 정정된다 — 인증 정보를 공개 캐시에 넣지 않기 위한 구조.
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <HomeNav slimOnMobile />
      {children}
    </div>
  );
}
