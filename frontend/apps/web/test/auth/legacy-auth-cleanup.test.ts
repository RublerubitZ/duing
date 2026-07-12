import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearLegacyWebAuthArtifacts } from '@/app/_lib/legacy-auth-cleanup';

describe('clearLegacyWebAuthArtifacts', () => {
  const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  let writtenCookies: string[];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    writtenCookies = [];
  });

  afterEach(() => {
    if (cookieDescriptor) Object.defineProperty(document, 'cookie', cookieDescriptor);
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
});
