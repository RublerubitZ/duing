import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 이벤트 레지스트리의 계약은 "PostHog 로 나가는 와이어 값이 바뀌지 않는다" 하나다.
 * 대시보드의 인사이트·퍼널·코호트가 이 문자열들을 붙잡고 있어, 개명은 과거 데이터와의 연속성을
 * 되돌릴 수 없게 끊는다. 래퍼가 이름·속성을 손대지 않고 그대로 흘리는지만 고정한다.
 */
const { mockPosthogCapture } = vi.hoisted(() => ({ mockPosthogCapture: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: mockPosthogCapture } }));

import { ANALYTICS_EVENT_NAMES, captureEvent } from '@/app/_lib/analytics';

describe('PostHog 이벤트 레지스트리', () => {
  beforeEach(() => {
    mockPosthogCapture.mockReset();
  });

  it('이벤트명과 속성을 손대지 않고 posthog.capture 로 넘긴다', () => {
    captureEvent('club_application_submitted', {
      recruitment_id: 10,
      club_name: '밴드부',
      application_id: 42,
    });

    expect(mockPosthogCapture).toHaveBeenCalledWith('club_application_submitted', {
      recruitment_id: 10,
      club_name: '밴드부',
      application_id: 42,
    });
  });

  // 찜 토글은 한 호출부가 삼항으로 두 이름을 낸다 — 한쪽만 등재하면 반대 방향이 조용히 사라진다.
  it('찜 추가와 해제를 각각의 이름으로 보낸다', () => {
    captureEvent('club_favorited', { club_id: 7 });
    captureEvent('club_unfavorited', { club_id: 7 });

    expect(mockPosthogCapture).toHaveBeenNthCalledWith(1, 'club_favorited', { club_id: 7 });
    expect(mockPosthogCapture).toHaveBeenNthCalledWith(2, 'club_unfavorited', { club_id: 7 });
  });

  // 속성 없이 발화하던 이벤트에 빈 객체가 붙으면 그것도 와이어 변화다 — 인자 자체가 없어야 한다.
  it('속성 없는 이벤트는 속성 인자 없이 보낸다', () => {
    captureEvent('password_reset_completed');

    expect(mockPosthogCapture).toHaveBeenCalledWith('password_reset_completed', undefined);
  });

  // 전송 직전 훅의 미등록 경고가 판정 근거로 쓰는 집합이다. 레지스트리에 추가하고 여기 빠뜨리면
  // 정상 이벤트가 개발 중 경고로 뜨고, 반대로 이름이 바뀌면 대시보드가 끊긴다.
  it('등재된 이벤트명 집합이 실제 와이어 값과 일치한다', () => {
    expect([...ANALYTICS_EVENT_NAMES].sort()).toEqual(
      [
        'apply_page_viewed',
        'club_application_submitted',
        'club_detail_viewed',
        'club_favorited',
        'club_unfavorited',
        'inquiry_submitted',
        'password_reset_completed',
        'recruitment_created',
        'user_logged_in',
        'user_signed_up',
      ].sort(),
    );
  });
});
