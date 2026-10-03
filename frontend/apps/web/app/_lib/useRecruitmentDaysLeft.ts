'use client';

import { recruitmentDaysLeft } from './recruitmentDisplay';
import { useHydrated } from './useHydrated';

/**
 * 마감까지 남은 일수(KST) — 하이드레이션 전(서버 렌더·하이드레이션 첫 프레임)에는 null.
 * 공개 상세는 24시간 ISR 이라 HTML 이 하루 넘게 묵을 수 있다. 렌더 시점의 오늘로 D-day 를 그리면 보는 날의
 * 하이드레이션과 글자가 달라져(#418) 경계 아래가 클라이언트 렌더로 다시 그려진다.
 * null 이면 호출처는 카운트다운 없이 상태 라벨("모집중")로 폴백한다.
 */
export function useRecruitmentDaysLeft(endDate: string | null | undefined): number | null {
  const hydrated = useHydrated();
  if (!hydrated || endDate == null) return null;
  return recruitmentDaysLeft(endDate);
}
