import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PROFILE_CHECK_SNOOZE_KEY,
  PROFILE_CHECK_SNOOZE_MS,
  clearProfileCheckSnooze,
  dismissProfileCheckForDocument,
  isProfileCheckHidden,
  snoozeProfileCheck,
} from '@/app/_lib/profileCheckSnooze';

// 문서 한정 숨김은 모듈 수명 동안 남는다 — 테스트마다 다른 사용자 id 를 써서 서로 섞이지 않게 한다.
const NOW = Date.UTC(2026, 2, 3, 0, 0, 0);

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('profileCheckSnooze', () => {
  it('"나중에 확인하기" 는 같은 사용자·학기를 숨기고 만료 시각을 저장한다', () => {
    const target = { userId: 1, semesterYear: 2026, semesterTerm: 1 };

    snoozeProfileCheck(target, NOW);

    expect(isProfileCheckHidden(target, NOW)).toBe(true);
    const stored = window.localStorage.getItem(PROFILE_CHECK_SNOOZE_KEY);
    expect(stored === null ? null : JSON.parse(stored)).toEqual({ ...target, until: NOW + PROFILE_CHECK_SNOOZE_MS });
  });

  it('저장된 숨김은 24시간이 지나면 풀린다', () => {
    const target = { userId: 2, semesterYear: 2026, semesterTerm: 1 };
    // 이전 문서가 남긴 값 — 이 문서에서는 닫은 적이 없다.
    window.localStorage.setItem(
      PROFILE_CHECK_SNOOZE_KEY,
      JSON.stringify({ ...target, until: NOW + PROFILE_CHECK_SNOOZE_MS }),
    );

    expect(isProfileCheckHidden(target, NOW + PROFILE_CHECK_SNOOZE_MS - 1)).toBe(true);
    expect(isProfileCheckHidden(target, NOW + PROFILE_CHECK_SNOOZE_MS)).toBe(false);
  });

  it('다른 사용자·다른 학기의 숨김은 적용하지 않는다', () => {
    window.localStorage.setItem(
      PROFILE_CHECK_SNOOZE_KEY,
      JSON.stringify({ userId: 3, semesterYear: 2026, semesterTerm: 1, until: NOW + 1000 }),
    );

    expect(isProfileCheckHidden({ userId: 4, semesterYear: 2026, semesterTerm: 1 }, NOW)).toBe(false);
    expect(isProfileCheckHidden({ userId: 3, semesterYear: 2026, semesterTerm: 2 }, NOW)).toBe(false);
  });

  it.each([
    ['JSON 이 아님', '{not-json'],
    ['필드 누락', JSON.stringify({ userId: 5, until: NOW + 1000 })],
    ['숫자가 아닌 필드', JSON.stringify({ userId: '5', semesterYear: 2026, semesterTerm: 1, until: NOW + 1000 })],
  ])('손상된 값(%s)은 무시한다', (_label, stored) => {
    window.localStorage.setItem(PROFILE_CHECK_SNOOZE_KEY, stored);

    expect(isProfileCheckHidden({ userId: 5, semesterYear: 2026, semesterTerm: 1 }, NOW)).toBe(false);
  });

  it('문서 한정 숨김은 저장소에 남기지 않는다', () => {
    const target = { userId: 6, semesterYear: 2026, semesterTerm: 1 };

    dismissProfileCheckForDocument(target);

    expect(isProfileCheckHidden(target, NOW)).toBe(true);
    expect(window.localStorage.getItem(PROFILE_CHECK_SNOOZE_KEY)).toBeNull();
  });

  it('저장소 접근이 거부돼도 예외 없이 이 문서 동안은 숨긴다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const target = { userId: 7, semesterYear: 2026, semesterTerm: 1 };

    expect(() => snoozeProfileCheck(target, NOW)).not.toThrow();
    expect(isProfileCheckHidden(target, NOW)).toBe(true);
    expect(isProfileCheckHidden({ userId: 8, semesterYear: 2026, semesterTerm: 1 }, NOW)).toBe(false);
  });

  it('로그인 때 지우면 저장된 숨김이 풀린다', () => {
    const target = { userId: 9, semesterYear: 2026, semesterTerm: 1 };
    window.localStorage.setItem(PROFILE_CHECK_SNOOZE_KEY, JSON.stringify({ ...target, until: NOW + 1000 }));

    clearProfileCheckSnooze();

    expect(window.localStorage.getItem(PROFILE_CHECK_SNOOZE_KEY)).toBeNull();
    expect(isProfileCheckHidden(target, NOW)).toBe(false);
  });
});
