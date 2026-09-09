import { afterEach, describe, expect, it, vi } from 'vitest';

import { joinLinkUrl } from '@/app/_lib/joinLinkUrl';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('joinLinkUrl', () => {
  it('브라우저에서는 현재 origin 을 붙인 절대 주소를 만든다', () => {
    expect(joinLinkUrl('ABCD1234')).toBe(`${window.location.origin}/join/ABCD1234`);
  });

  it('window 가 없는 서버 렌더에서는 상대 경로로 떨어진다', () => {
    vi.stubGlobal('window', undefined);
    expect(joinLinkUrl('ABCD1234')).toBe('/join/ABCD1234');
  });
});
