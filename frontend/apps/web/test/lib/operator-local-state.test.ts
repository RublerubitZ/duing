import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearOperatorLocalState } from '@/app/_lib/operatorLocalState';

describe('clearOperatorLocalState — 명시적 로그아웃 시 운영진 로컬 상태 정리', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('마지막 본 동아리와 모든 모집 임시저장을 지우고, 무관한 키는 남긴다', () => {
    window.localStorage.setItem('duing:manage:last-club', '7');
    window.localStorage.setItem('duing:recruitment-draft:7', '{"values":{},"savedAt":1}');
    window.localStorage.setItem('duing:recruitment-draft:12', '{"values":{},"savedAt":2}');
    window.localStorage.setItem('duing:visitor', 'visitor-key');
    window.localStorage.setItem('duing:info-last-path', '/faq');

    clearOperatorLocalState();

    // 공용 PC 에서 다음 사용자에게 이전 운영진의 동아리·작성 중 모집 본문이 보이면 안 된다.
    expect(window.localStorage.getItem('duing:manage:last-club')).toBeNull();
    expect(window.localStorage.getItem('duing:recruitment-draft:7')).toBeNull();
    expect(window.localStorage.getItem('duing:recruitment-draft:12')).toBeNull();
    // 개인정보가 아닌 키는 로그아웃과 무관하게 유지한다.
    expect(window.localStorage.getItem('duing:visitor')).toBe('visitor-key');
    expect(window.localStorage.getItem('duing:info-last-path')).toBe('/faq');
  });

  it('저장소가 차단돼 있어도 예외를 밖으로 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('localStorage blocked (privacy mode)');
    });

    // 정리 실패가 로그아웃 자체를 깨뜨리면 사용자가 기기에 로그인된 채로 남는다.
    expect(() => clearOperatorLocalState()).not.toThrow();
  });
});
