import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeNavAuthSlot } from '@/app/_components/HomeNavAuthSlot';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  vi.restoreAllMocks();
});

// 정적 HTML 의 비로그인 인증 자리는 하이드레이션 전에만 표지를 단다 — 로그인 이력이 있는 브라우저는 그 동안
// CSS 로 숨긴다(globals.css). 하이드레이션 첫 렌더는 서버와 같아야 하고, 그 직후 표지가 빠져 숨김이 풀려야 한다.
describe('HomeNavAuthSlot — 하이드레이션 전에만 표지를 단다', () => {
  it('서버 HTML 에는 표지가 있고, 불일치 없이 하이드레이션한 뒤 표지가 빠진다', async () => {
    const serverHtml = renderToString(<HomeNavAuthSlot />);
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    // 텍스트 불일치는 onRecoverableError 로, 속성 불일치는 console.error 경고로만 온다(React 19).
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    let root: Root | undefined;

    try {
      root = await act(async () =>
        hydrateRoot(container, <HomeNavAuthSlot />, { onRecoverableError: (error) => recoverableErrors.push(error) }),
      );
      const hydrationWarnings = consoleErrorSpy.mock.calls.filter((args) => /hydrat/i.test(args.map(String).join(' ')));

      expect(serverHtml).toContain('data-auth-seeding');
      expect(recoverableErrors).toEqual([]);
      expect(hydrationWarnings).toEqual([]);
      expect(container.querySelector('[data-auth-seeding]')).toBeNull();
      expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    } finally {
      if (root) act(() => root?.unmount());
      container.remove();
    }
  });
});
