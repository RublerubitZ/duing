import { afterEach, describe, expect, it, vi } from 'vitest';

import { HAD_SESSION_KEY, HAD_SESSION_PREPAINT_SCRIPT } from '@/app/_lib/hadSessionKey';

// 레이아웃이 첫 페인트 전에 실행하는 문자열 그대로를 돌린다 — 하이드레이션 전 상단 내비 숨김(globals.css)의 근거 속성.
function runPrepaintScript() {
  new Function(HAD_SESSION_PREPAINT_SCRIPT)();
}

const hasMarker = () => document.documentElement.hasAttribute('data-had-session');

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-had-session');
});

describe('첫 페인트 전 로그인 이력 표지', () => {
  it('로그인 이력이 있으면 <html data-had-session> 을 단다', () => {
    window.localStorage.setItem(HAD_SESSION_KEY, '1');

    runPrepaintScript();

    expect(hasMarker()).toBe(true);
  });

  it('이력이 없으면 달지 않는다 — 첫 방문·로그아웃 뒤에는 지금처럼 로그인 버튼이 보인다', () => {
    runPrepaintScript();

    expect(hasMarker()).toBe(false);
  });

  it('저장소 읽기가 실패해도(프라이빗 모드) 예외 없이 표지를 달지 않는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(runPrepaintScript).not.toThrow();
    expect(hasMarker()).toBe(false);
  });

  it('저장소 접근 자체가 막혀도(쿠키 차단) 예외 없이 표지를 달지 않는다', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(runPrepaintScript).not.toThrow();
    expect(hasMarker()).toBe(false);
  });
});
