import posthog from 'posthog-js';

import type { College, Grade } from '@duing/types';

/**
 * PostHog 제품 이벤트 레지스트리 — 이벤트명과 속성의 단일 출처.
 *
 * <p>전에는 9개 화면이 각자 `posthog.capture('...', { ... })` 문자열 리터럴을 들고 있어서,
 * 같은 뜻의 속성이 화면마다 다른 이름으로 나가도(또는 오타 하나로 이벤트가 통째로 새 이름이 돼도)
 * 대시보드에 도착하기 전에는 아무도 알 수 없었다. 여기 등재된 이름만 타입이 통과한다.
 *
 * <p><b>와이어 값 불변 계약.</b> 아래 키(이벤트명)와 속성 이름은 이미 대시보드의 인사이트·퍼널·
 * 코호트가 붙잡고 있는 값이다. 바꾸는 순간 과거 데이터와의 연속성이 끊기고 되돌릴 수 없으므로,
 * 리팩터링 편의로 개명하지 않는다. 새 이벤트는 추가만 한다.
 *
 * <p><b>알려진 접두 불일치 1건.</b> `club_application_submitted` 는 도메인 접두(`club_`)를 쓰고
 * `inquiry_submitted` 는 쓰지 않는다. 규칙상으로는 어긋나지만 위 불변 계약이 우선이라 그대로 둔다.
 *
 * <p>범위 밖: `identify`/`reset`(신원 수명주기)과 `$` 접두 SDK 내장 이벤트는 여기서 다루지 않는다.
 */
type AnalyticsEvents = {
  user_signed_up: { college: College; grade: Grade };
  user_logged_in: { remember_me: boolean };
  /** 속성 없이 발화한다. */
  password_reset_completed: void;
  club_detail_viewed: { club_id: number };
  apply_page_viewed: { recruitment_id: number };
  club_application_submitted: {
    recruitment_id: number;
    club_name: string;
    application_id: number;
  };
  club_favorited: { club_id: number };
  club_unfavorited: { club_id: number };
  inquiry_submitted: { inquiry_id: number; has_attachments: boolean };
  recruitment_created: {
    club_id: number;
    recruitment_id: number;
    application_mode: 'SELF' | 'EXTERNAL';
    use_interview: boolean;
    cloned: boolean;
  };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

type EventWithoutProperties = {
  [EventName in AnalyticsEventName]: AnalyticsEvents[EventName] extends void ? EventName : never;
}[AnalyticsEventName];
type EventWithProperties = Exclude<AnalyticsEventName, EventWithoutProperties>;

/**
 * 런타임 검증용 이벤트명 집합 — `Record<AnalyticsEventName, true>` 를 거치므로 위 레지스트리에
 * 이벤트를 추가하고 여기 빠뜨리면 타입 검사에서 걸린다(집합만 따로 두면 조용히 어긋난다).
 */
const REGISTERED_EVENTS: Record<AnalyticsEventName, true> = {
  user_signed_up: true,
  user_logged_in: true,
  password_reset_completed: true,
  club_detail_viewed: true,
  apply_page_viewed: true,
  club_application_submitted: true,
  club_favorited: true,
  club_unfavorited: true,
  inquiry_submitted: true,
  recruitment_created: true,
};

export const ANALYTICS_EVENT_NAMES: ReadonlySet<string> = new Set(Object.keys(REGISTERED_EVENTS));

/**
 * 등재된 이벤트를 PostHog 로 보낸다. 내부는 `posthog.capture` 그대로라 전송 경로·와이어 형태가
 * 직접 호출과 완전히 같다(테스트의 `posthog-js` 모듈 목킹도 그대로 유효하다).
 */
export function captureEvent<EventName extends EventWithProperties>(
  event: EventName,
  properties: AnalyticsEvents[EventName],
): void;
export function captureEvent(event: EventWithoutProperties): void;
export function captureEvent(event: AnalyticsEventName, properties?: Record<string, unknown>): void {
  posthog.capture(event, properties);
}
