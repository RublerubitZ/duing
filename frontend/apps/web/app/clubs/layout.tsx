import type { ReactNode } from 'react';
import { ExploreNav } from '../_components/ExploreNav';
import { ClubsSlotFrame } from './_components/ClubsSlotFrame';

// 상세는 목록에서 소프트 이동하면 modal 슬롯의 인터셉트 라우트(@modal/(.)[clubId])로 열린다. 판별·목록 숨김은 ClubsSlotFrame 이
// 맡는다 — 목록을 숨긴 채 마운트해 두어 뒤로가기(iOS 스와이프 백) 때 다시 그리지 않는다(스펙 P1).
export default function ClubsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      <ClubsSlotFrame modal={modal}>{children}</ClubsSlotFrame>
    </div>
  );
}
