// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { webCookieAdapter } from '@/app/_lib/cookie-adapter';

describe('webCookieAdapter', () => {
  const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  const originalLocation = window.location;
  let written: string[];

  beforeEach(() => {
    // document.cookie 의 setter 를 가로채 실제로 기록되는 쿠키 문자열(속성 포함)을 캡처한다.
    // (jsdom 은 getter 에서 속성을 떼므로 setter 캡처가 Secure/SameSite 검증의 유일한 방법)
    written = [];
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => written.at(-1) ?? '',
      set: (value: string) => {
        written.push(value);
      },
    });
  });

  afterEach(() => {
    if (cookieDescriptor) {
      Object.defineProperty(document, 'cookie', cookieDescriptor);
    }
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  function withProtocol(protocol: string): void {
    Object.defineProperty(window, 'location', { configurable: true, value: { protocol } });
  }

  it('HTTPS 운영에서는 토큰 쿠키에 Secure 를 붙인다', () => {
    withProtocol('https:');

    webCookieAdapter.set('jwt-token');

    const cookie = written.at(-1) ?? '';
    expect(cookie).toContain('duing_token=jwt-token');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });

  it('로컬 http 에서는 Secure 를 붙이지 않아 쿠키가 저장되게 한다', () => {
    withProtocol('http:');

    webCookieAdapter.set('jwt-token');

    expect(written.at(-1) ?? '').not.toContain('Secure');
  });

  it('clear 도 같은 프로토콜 규칙으로 쿠키를 만료시킨다', () => {
    withProtocol('https:');

    webCookieAdapter.clear();

    const cookie = written.at(-1) ?? '';
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Secure');
  });
});
