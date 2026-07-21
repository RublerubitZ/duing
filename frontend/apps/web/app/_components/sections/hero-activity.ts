// Hero 우측 활동 토스트의 순수 도메인 로직. Server Component 와 분리해 단위 테스트 가능하게 둔다.
// React/DOM 에 의존하지 않는다. Phase C 가 API 응답을 HeroActivity[] 로 매핑해 resolveHeroToasts 에 넘긴다.

import { formatRelativeTime } from '@duing/hooks/datetime';

export type HeroActivityType =
  | 'RECRUIT_OPEN'
  | 'RECRUIT_CLOSE'
  | 'NOTICE_CREATED'
  | 'INTERVIEW_CREATED'
  | 'INTERVIEW_RESULT'
  | 'EVENT_CREATED'
  | 'FEE_OPEN';

// occurredAt: "이벤트 발생 시각"(ISO 8601). 생성 시각이 아니라 발생 시각 의미.
export type HeroActivity = {
  type: HeroActivityType;
  clubName: string;
  occurredAt: string;
};

export type HeroToastVariant = 'light' | 'dark';

// 프레젠테이션 모델 — HeroActivityToast 가 그대로 받는다.
export type HeroToast = {
  variant: HeroToastVariant;
  clubName: string;
  message: string;
  timeAgo: string;
};

const ACTIVITY_PRESETS: Record<HeroActivityType, { message: string; variant: HeroToastVariant }> = {
  RECRUIT_OPEN: { message: '신규 모집 오픈', variant: 'light' },
  RECRUIT_CLOSE: { message: '모집 마감', variant: 'light' },
  NOTICE_CREATED: { message: '새 공지 등록', variant: 'light' },
  INTERVIEW_CREATED: { message: '면접 일정 등록', variant: 'dark' },
  INTERVIEW_RESULT: { message: '합격자 발표', variant: 'dark' },
  EVENT_CREATED: { message: '행사 등록', variant: 'light' },
  FEE_OPEN: { message: '회비 납부 시작', variant: 'dark' },
};

// 실활동이 부족할 때 채우는 슬롯별 기본 토스트. slot0=light, slot1=dark 로 시각 균형을 유지하고,
// 실제 동아리명 대신 일반 명칭을 써 초기 서비스에서도 어색하지 않게 한다.
const FALLBACK_LIGHT: HeroToast = {
  variant: 'light',
  clubName: '캠퍼스 동아리',
  message: '신규 모집 오픈',
  timeAgo: '방금 전',
};
const FALLBACK_DARK: HeroToast = {
  variant: 'dark',
  clubName: '캠퍼스 동아리',
  message: '합격자 발표',
  timeAgo: '방금 전',
};

// 실활동(있으면)을 토스트로 매핑, 없으면 슬롯 폴백을 쓴다.
function toHeroToast(activity: HeroActivity | undefined, fallback: HeroToast, now: Date): HeroToast {
  if (!activity) return fallback;
  const preset = ACTIVITY_PRESETS[activity.type];
  return {
    variant: preset.variant,
    clubName: activity.clubName,
    message: preset.message,
    timeAgo: formatRelativeTime(activity.occurredAt, now),
  };
}

// 실활동 최대 2개를 토스트로 매핑하고, 부족한 슬롯은 폴백으로 채워 항상 정확히 2개(튜플)를 반환한다.
// 튜플 반환이라 호출부의 toasts[0]/toasts[1] 가 noUncheckedIndexedAccess 에서도 안전하다(2개 초과는 무시).
export function resolveHeroToasts(activities: HeroActivity[], now: Date): [HeroToast, HeroToast] {
  return [
    toHeroToast(activities[0], FALLBACK_LIGHT, now),
    toHeroToast(activities[1], FALLBACK_DARK, now),
  ];
}
