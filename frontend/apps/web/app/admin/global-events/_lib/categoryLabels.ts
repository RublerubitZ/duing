import type { GlobalEventCategory } from '@duing/types';

export const GLOBAL_EVENT_CATEGORY_LABEL: Record<GlobalEventCategory, string> = {
  FAIR: '박람회',
  FESTIVAL: '축제·공연',
  APPLICATION: '신청 시작/마감',
  CONTEST: '대회',
  UNION: '총동연 행사',
  OTHER: '기타 (가급적 다른 카테고리 사용)',
};

// select 의 표시 순서 — OTHER 가 마지막.
export const GLOBAL_EVENT_CATEGORY_ORDER: GlobalEventCategory[] = [
  'FAIR',
  'FESTIVAL',
  'APPLICATION',
  'CONTEST',
  'UNION',
  'OTHER',
];

export function isGlobalEventCategory(value: string): value is GlobalEventCategory {
  return (GLOBAL_EVENT_CATEGORY_ORDER as readonly string[]).includes(value);
}
