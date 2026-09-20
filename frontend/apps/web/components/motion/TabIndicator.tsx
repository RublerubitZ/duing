'use client';

// 탭 스트립의 활성 인디케이터 — 항목 자체의 보더 대신, 활성 항목 안에만 절대 배치된 막대를 렌더한다.
// 같은 layoutId 를 쓰는 막대가 다른 항목으로 옮겨가면 framer 가 두 위치를 잇는 layout 전환을 붙여
// 인디케이터가 미끄러진다(항목마다 span 을 두고 CSS 로 토글하면 요소가 달라 전환이 성립하지 않는다).
//
// LazyMotion 이 여기만 domMax 인 이유: layout/layoutId 피처는 domAnimation(features-animation)에 없고
// features-max 에만 들어 있다. 기존 FadeIn/Reveal 의 domAnimation 은 그대로 둔다.
// 번들 비용은 붙이는 라우트에 따라 크게 다르다. 동아리 상세는 PhotoLightbox(framer motion + drag)를
// ClubDetailHeroActivities·ClubDetailPhotos 가 정적 import 해 풀 피처가 이미 있었으므로 실측 증가가
// +1 kB(First Load 424→425 kB)뿐이었다. motion 이 없는 라우트에 붙이면 훨씬 커진다 —
// /me +45 kB·/clubs +46 kB(PR 당시 실측).
//
// reduced-motion 은 providers 의 MotionConfig reducedMotion="user" 가 layout 애니메이션까지 끄므로
// 여기서 따로 분기하지 않는다 — 동작 줄이기 환경에선 인디케이터가 즉시 옮겨간다.
//
// 지금 쓰는 곳은 동아리 상세 탭 하나(layoutId="club-detail-tab")다. 스트립을 더 붙일 때는
// layoutId 를 스트립마다 다르게 준다 — 같은 값을 쓰면 서로의 막대를 끌어당긴다.

import { LazyMotion, domMax, m } from 'framer-motion';

type Props = { layoutId: string };

export function TabIndicator({ layoutId }: Props) {
  return (
    <LazyMotion features={domMax} strict>
      <m.span
        layoutId={layoutId}
        data-tab-indicator
        aria-hidden
        // 강제 색상(고대비) 모드는 배경을 Canvas 로 칠해 막대가 사라진다 — 시스템 색 CanvasText 로 남긴다.
        className="absolute inset-x-0 -bottom-[2.5px] h-[2.5px] rounded-full bg-ink forced-colors:bg-[CanvasText]"
        // 탭 이동 전용 이징 — 초반에 붙고 끝에서 부드럽게 서는 곡선(공용 ease-duing 과 다른 값).
        transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      />
    </LazyMotion>
  );
}
