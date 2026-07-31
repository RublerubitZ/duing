import { useId } from 'react';
import type { SVGProps } from 'react';

// 모바일 하단 탭바 전용 아이콘. 나머지 탭(탐색·정보)은 Heroicons v2 의 Outline/Solid 짝을
// 그대로 쓰지만, 아래 셋은 그 세트에 마땅한 짝이 없어 직접 그린다.
//
// - 홈: Heroicons 의 집은 채움에서 처마가 좌우로 튀어나와 아웃라인과 실루엣이 어긋난다.
//       꼭짓점·처마이음·바닥모서리를 모두 굴린 하나의 실루엣을 아웃라인과 채움이 공유한다.
// - 시설: lucide Building2 가 이 크기에서 가장 또렷해 아웃라인은 그대로 두고 짝만 그린다.
//
// Heroicons 와 획 굵기(1.5)·라운드 캡을 맞춰 한 세트처럼 보이게 한다.

type IconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  size?: number;
};

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/* ── 홈 ────────────────────────────────────────────────────────────── */

/** 아웃라인과 채움이 공유하는 집 실루엣(문 제외). */
const HOME_SILHOUETTE =
  'M10.94 3.02 3.6 9.9a2 2 0 0 0-.6 1.42V19.2A1.8 1.8 0 0 0 4.8 21h14.4a1.8 1.8 0 0 0 1.8-1.8v-7.88a2 2 0 0 0-.6-1.42l-7.34-6.88a1.55 1.55 0 0 0-2.12 0Z';
/** 아웃라인에서만 쓰는 문. 채움에서는 아래 모서리에서 파고든 홈으로 처리한다. */
const HOME_DOOR = 'M10.2 21v-4.4a1.2 1.2 0 0 1 1.2-1.2h1.2a1.2 1.2 0 0 1 1.2 1.2V21';
/** 위 실루엣과 같은 좌표에 문 홈을 낸 채움용 단일 path. */
const HOME_FILLED =
  'M10.94 3.02 3.6 9.9a2 2 0 0 0-.6 1.42V19.2A1.8 1.8 0 0 0 4.8 21h5.4v-4.4a1.2 1.2 0 0 1 1.2-1.2h1.2a1.2 1.2 0 0 1 1.2 1.2V21h5.4a1.8 1.8 0 0 0 1.8-1.8v-7.88a2 2 0 0 0-.6-1.42l-7.34-6.88a1.55 1.55 0 0 0-2.12 0Z';

export function HomeOutline({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...STROKE} {...rest}>
      <path d={HOME_SILHOUETTE} />
      <path d={HOME_DOOR} />
    </svg>
  );
}

export function HomeFilled({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d={HOME_FILLED} />
    </svg>
  );
}

/* ── 시설 ──────────────────────────────────────────────────────────── */

// lucide Building2 의 외곽 path 원본. 비활성(아웃라인)이 lucide 를 그대로 쓰므로 같은 좌표를
// 재사용해야 탭을 눌러도 실루엣이 어긋나지 않는다. 열린 path 라 채울 때 시작·끝점이 자동으로 이어진다.
const BUILDING_WING = 'M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2';
const BUILDING_TOWER = 'M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16';

/**
 * 실루엣은 두 path 의 합집합이고 창문·문은 구멍이라, fill-rule 하나로는 동시에 표현할 수 없다.
 * 마스크로 합집합(흰색)에서 구멍(검정)을 덜어낸다 — 탭바 배경이 반투명(bg-paper/85 + blur)이라
 * 배경색으로 덮는 방식은 쓸 수 없다.
 */
export function BuildingFilled({ size = 24, ...rest }: IconProps) {
  const maskId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="black" />
        <path d={BUILDING_WING} fill="white" />
        <path d={BUILDING_TOWER} fill="white" />
        {/* 창문 — 건물 외곽의 둥근 인상에 맞춰 rx 로 양 끝을 굴린 알약. 폭·두께·위치는 직사각형일 때와 같다. */}
        <rect x="10" y="7.2" width="4" height="1.6" rx="0.8" fill="black" />
        <rect x="10" y="11.2" width="4" height="1.6" rx="0.8" fill="black" />
        <path d="M10 21v-3a2 2 0 0 1 4 0v3z" fill="black" />
      </mask>
      <rect width="24" height="24" mask={`url(#${maskId})`} />
    </svg>
  );
}

// 캘린더는 Heroicons 의 기본형(날짜 칸 없는 빈 몸통)을 그대로 쓴다 — BottomNav 참조.
