import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearLegacyWebAuthArtifacts } from '@/app/_lib/legacy-auth-cleanup';

describe('clearLegacyWebAuthArtifacts', () => {
  const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
  let writtenCookies: string[];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    writtenCookies = [];
  });

  afterEach(() => {
    if (cookieDescriptor) Object.defineProperty(document, 'cookie', cookieDescriptor);
    if (localStorageDescriptor) {
      Object.defineProperty(window, 'localStorage', localStorageDescriptor);
    }
    if (sessionStorageDescriptor) {
      Object.defineProperty(window, 'sessionStorage', sessionStorageDescriptor);
    }
  });

  it('인증 흔적만 localStorage sessionStorage와 legacy cookie에서 제거한다', () => {
    localStorage.setItem('duing.accessToken', 'legacy-local-jwt');
    sessionStorage.setItem('duing.accessToken', 'legacy-session-jwt');
    localStorage.setItem('duing:info-last-path', '/faq');
    document.cookie = 'duing_token=legacy-cookie; Path=/';

    clearLegacyWebAuthArtifacts();

    expect(localStorage.getItem('duing.accessToken')).toBeNull();
    expect(sessionStorage.getItem('duing.accessToken')).toBeNull();
    expect(localStorage.getItem('duing:info-last-path')).toBe('/faq');
    expect(document.cookie).not.toContain('duing_token=');
  });

  it('host-only와 운영 도메인의 legacy cookie를 모두 즉시 만료시킨다', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: (value: string) => writtenCookies.push(value),
    });

    clearLegacyWebAuthArtifacts();

    expect(writtenCookies).toHaveLength(2);
    expect(writtenCookies[0]).toContain('duing_token=; Path=/; Max-Age=0; SameSite=Lax');
    expect(writtenCookies[1]).toContain(
      'duing_token=; Domain=.duings.com; Path=/; Max-Age=0; SameSite=Lax',
    );

    expect(() => clearLegacyWebAuthArtifacts()).not.toThrow();
    expect(writtenCookies).toHaveLength(4);
  });

  it('localStorage 접근이 거부되어도 sessionStorage와 cookie 정리를 계속한다', () => {
    sessionStorage.setItem('duing.accessToken', 'legacy-session-jwt');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: (value: string) => writtenCookies.push(value),
    });

    expect(() => clearLegacyWebAuthArtifacts()).not.toThrow();
    expect(sessionStorage.getItem('duing.accessToken')).toBeNull();
    expect(writtenCookies).toHaveLength(2);
  });

  it('sessionStorage 접근이 거부되어도 localStorage와 cookie 정리를 계속한다', () => {
    localStorage.setItem('duing.accessToken', 'legacy-local-jwt');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: (value: string) => writtenCookies.push(value),
    });

    expect(() => clearLegacyWebAuthArtifacts()).not.toThrow();
    expect(localStorage.getItem('duing.accessToken')).toBeNull();
    expect(writtenCookies).toHaveLength(2);
  });

  it('한 cookie 삭제 쓰기가 거부되어도 나머지 정리를 계속한다', () => {
    localStorage.setItem('duing.accessToken', 'legacy-local-jwt');
    sessionStorage.setItem('duing.accessToken', 'legacy-session-jwt');
    let cookieWriteCount = 0;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: () => {
        cookieWriteCount += 1;
        if (cookieWriteCount === 1) throw new DOMException('denied', 'SecurityError');
      },
    });

    expect(() => clearLegacyWebAuthArtifacts()).not.toThrow();
    expect(localStorage.getItem('duing.accessToken')).toBeNull();
    expect(sessionStorage.getItem('duing.accessToken')).toBeNull();
    expect(cookieWriteCount).toBe(2);
  });
});
