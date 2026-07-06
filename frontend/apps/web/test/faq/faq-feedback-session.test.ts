import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFaqFeedbackSessionKey } from '../../app/faq/_lib/faqFeedbackSession';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('faqFeedbackSession — localStorage 차단 환경 in-memory 폴백', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('localStorage.getItem 이 예외를 던지면 in-memory UUID 로 폴백하고, 재호출해도 같은 값을 유지한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked (privacy mode)');
    });

    const first = getFaqFeedbackSessionKey();
    const second = getFaqFeedbackSessionKey();

    expect(first).not.toBeNull();
    expect(first).toMatch(UUID_PATTERN);
    expect(second).toBe(first);
  });
});
