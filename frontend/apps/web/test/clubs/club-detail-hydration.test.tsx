import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/clubs/1',
  useParams: () => ({ clubId: '1' }),
  useSelectedLayoutSegment: () => null,
}));

import { clubDetail, seededClubDetailTree } from './club-detail-tree-fixture';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function envelope(data: unknown) {
  return HttpResponse.json({ ok: true, message: null, data });
}

// 하이드레이션 뒤 마운트 재요청·사진·히어로 활동·조회 비콘이 실제 네트워크로 나가지 않게 막는다.
const server = setupServer(
  http.get('*/clubs/1', () => envelope(clubDetail)),
  http.get('*/clubs/1/photos', () => envelope([])),
  http.get('*/clubs/1/hero-activities', () => envelope([])),
  http.post('*/clubs/1/views', () => new HttpResponse(null, { status: 204 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

// jsdom 에는 window·document 가 있다 — 지우지 않으면 typeof window 분기가 서버 렌더에서도 브라우저 쪽을 타
// 불일치를 못 잡는다. 모듈 로드 때 굳는 판정(라이브러리의 isServer 등)까지 서버로 돌리지는 못한다.
function renderAsServer(): string {
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('document', undefined);
  try {
    return renderToString(seededClubDetailTree());
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('동아리 상세 트리 — 하이드레이션(ISR HTML 회귀)', () => {
  it('운영형 시드로 그린 서버 HTML 을 불일치 없이 하이드레이션한다', async () => {
    const serverHtml = renderAsServer();
    expect(serverHtml).toContain('함께 운동해요');

    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    // 속성 불일치는 복구 없이 console.error 경고로만 남는다(React 19) — 텍스트 불일치는 onRecoverableError 로 온다.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];

    const root = await act(async () =>
      hydrateRoot(container, seededClubDetailTree(), {
        onRecoverableError: (error) => recoverableErrors.push(error),
      }),
    );
    const hydratedText = container.textContent;
    const hydrationWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      /hydrat/i.test(args.map(String).join(' ')),
    );
    // msw 의 onUnhandledRequest:'error' 는 console.error 로만 알린다 — 위 스파이가 삼키므로 여기서 직접 본다.
    const unhandledRequests = consoleErrorSpy.mock.calls.filter((args) =>
      /matching request handler/.test(args.map(String).join(' ')),
    );
    act(() => root.unmount());
    consoleErrorSpy.mockRestore();
    container.remove();

    expect(recoverableErrors).toEqual([]);
    expect(hydrationWarnings).toEqual([]);
    expect(unhandledRequests).toEqual([]);
    // 서버 HTML 에서 뺀 D-day 가 하이드레이션 뒤에 붙는다 — 첫 프레임 다음 렌더까지 실제로 돌았다는 표지.
    expect(hydratedText).toContain('모집중 · D-3');
  });
});
