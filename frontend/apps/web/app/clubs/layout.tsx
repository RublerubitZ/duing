import type { ReactNode } from 'react';
import { ExploreNav } from '../_components/ExploreNav';
import { ClubsSlotFrame } from './_components/ClubsSlotFrame';

// 상세는 목록에서 소프트 이동하면 modal 슬롯의 인터셉트 라우트(@modal/(...)clubs/[clubId])로 열린다. 판별·목록 숨김은 ClubsSlotFrame 이
// 맡는다 — 목록을 숨긴 채 마운트해 두어 뒤로가기(iOS 스와이프 백) 때 다시 그리지 않는다(스펙 P1).
// 루트 div 는 쌓임 맥락을 만들지 않은 채 불투명 크림 배경으로 화면을 덮는다 — 상세가 열린 동안 모바일 목록이 그 아래(음수 z-index)에
// 그려져 있어 이 배경이 1차로 가린다. transform·filter·opacity·isolation·will-change·contain 이나 position+z-index 를 걸면 목록 층이
// 이 배경 위로 올라와, 가림이 숨은 목록 래퍼 안의 크림 막(ClubsSlotFrame after:) 하나에만 기댄다.
export default function ClubsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      <ClubsSlotFrame modal={modal}>{children}</ClubsSlotFrame>
    </div>
  );
}
