import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getVisitorKey } from '@/app/_lib/visitorKey';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('visitorKey — 관심도 집계용 익명 방문자 식별자', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('처음 호출하면 UUID 를 만들어 저장하고, 다시 호출해도 같은 값을 돌려준다', () => {
    const first = getVisitorKey();
    const second = getVisitorKey();

    expect(first).toMatch(UUID_PATTERN);
    // 값이 바뀌면 같은 사람이 매번 새 방문자로 집계돼 관심도가 부풀려진다.
    expect(second).toBe(first);
    expect(window.localStorage.getItem('duing:visitor')).toBe(first);
  });

  it('이미 저장된 키가 있으면 새로 만들지 않고 그대로 쓴다', () => {
    window.localStorage.setItem('duing:visitor', 'existing-visitor-key');

    expect(getVisitorKey()).toBe('existing-visitor-key');
  });

  it('localStorage 가 차단되면 in-memory 키로 폴백하고, 재호출해도 같은 값을 유지한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked (privacy mode)');
    });

    const first = getVisitorKey();
    const second = getVisitorKey();

    expect(first).toMatch(UUID_PATTERN);
    expect(second).toBe(first);
  });

  it('FAQ 피드백 세션 키와 저장 슬롯을 공유하지 않는다', () => {
    window.localStorage.setItem('duing:faq-feedback-session', 'faq-session-key');

    // 한쪽을 지우거나 정책을 바꿀 때 다른 쪽 집계가 함께 흔들리면 안 된다.
    expect(getVisitorKey()).not.toBe('faq-session-key');
  });
});
