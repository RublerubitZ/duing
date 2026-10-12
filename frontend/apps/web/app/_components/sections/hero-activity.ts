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

/** 토스트 캐러셀 슬라이드 상한 — 이보다 많이 오면 앞에서부터 자른다. */
export const MAX_HERO_TOASTS = 5;

// 실활동이 하나도 없을 때만 쓰는 기본 토스트. 실제 동아리명 대신 일반 명칭을 써
// 초기 서비스에서도 어색하지 않게 한다. 슬라이드가 하나뿐이라 페이저는 자동으로 사라진다.
// 가짜 토스트를 여러 장 깔지 않는 이유 — 활동이 없는 상태를 활발한 것처럼 보이게 하지 않는다.
const FALLBACK_TOAST: HeroToast = {
  variant: 'light',
  clubName: '캠퍼스 동아리',
  message: '신규 모집 오픈',
  timeAgo: '방금 전',
};

function toHeroToast(activity: HeroActivity, now: Date): HeroToast | null {
  // 백엔드가 먼저 배포한 새 활동 타입은 문구를 모르므로 건너뛴다 — 서버 렌더(ISR)를 깨지 않게, 그리고
  // 무슨 일인지 모르는 활동을 그럴듯한 문구로 꾸미지 않게(폴백 토스트와 같은 원칙).
  const preset = ACTIVITY_PRESETS[activity.type];
  if (!preset) return null;
  return {
    variant: preset.variant,
    clubName: activity.clubName,
    message: preset.message,
    timeAgo: formatRelativeTime(activity.occurredAt, now),
  };
}

/**
 * 실활동을 최대 {@link MAX_HERO_TOASTS} 개까지 토스트로 매핑한다. 문구를 모르는 활동은 건너뛴다.
 * 남는 활동이 하나도 없으면 폴백 한 장만 돌려준다 — 항상 1개 이상이라 호출부가 빈 배열을 다룰 필요가 없다.
 */
export function resolveHeroToasts(activities: HeroActivity[], now: Date): HeroToast[] {
  const toasts = activities
    .flatMap((activity) => toHeroToast(activity, now) ?? [])
    .slice(0, MAX_HERO_TOASTS);
  return toasts.length > 0 ? toasts : [FALLBACK_TOAST];
}
