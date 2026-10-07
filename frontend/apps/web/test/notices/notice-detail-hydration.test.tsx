import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NoticeDetail } from '@duing/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/notices/42',
  useParams: () => ({ noticeId: '42' }),
  useSelectedLayoutSegment: () => null,
}));

// framer-motion(motion-dom) 은 isBrowser 를 모듈 로드 때 굳히고 initPrefersReducedMotion 에서 window.matchMedia 를
// 재검사 없이 읽는다 — window 를 지운 서버 흉내 렌더에서 NoticeImageLightbox(NoticeContent·NoticePosterHero 가 항상
// 렌더)의 useReducedMotion 이 TypeError 로 죽는다. 닫힌 라이트박스는 motion.* 를 그리지 않으므로 값만 고정한다.
// 운영 서버는 모듈 로드 때부터 window 가 없어(isBrowser=false) 이 경로를 타지 않는다.
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => null,
}));

import {
  eventNoticeDetail,
  expiredNoticeDetail,
  noticeDetail,
  seededNoticeDetailTree,
} from './notice-detail-tree-fixture';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function envelope(data: unknown) {
  return HttpResponse.json({ ok: true, message: null, data });
}

// 하이드레이션 뒤 마운트 재요청·관련 소식 목록이 실제 네트워크로 나가지 않게 막는다.
const server = setupServer(
  http.get('*/notices/42', () => envelope(noticeDetail)),
  http.get('*/notices', () =>
    envelope({ content: [], page: 0, size: 4, totalElements: 0, totalPages: 0, hasNext: false }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom 에는 window·document 가 있다 — 지우지 않으면 typeof window 분기가 서버 렌더에서도 브라우저 쪽을 타
// 불일치를 못 잡는다. 모듈 로드 때 굳는 판정(라이브러리의 isServer 등)까지 서버로 돌리지는 못한다.
// serverNow 를 주면 서버 렌더만 그 시각으로 돌린다 — 가짜로 두는 건 Date 뿐이고 끝나면 실제 시계로 되돌린다.
function renderAsServer(notice: NoticeDetail, serverNow?: number): string {
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('document', undefined);
  try {
    if (serverNow !== undefined) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(serverNow);
    }
    return renderToString(seededNoticeDetailTree(notice));
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
}

/** 서버 흉내 렌더 → 하이드레이션 뒤 텍스트와 불일치·미처리 요청 신호를 모은다. 하이드레이션은 실제 시계로 돈다. */
async function hydrateSeededTree(notice: NoticeDetail, serverNow?: number) {
  const serverHtml = renderAsServer(notice, serverNow);
  const container = document.createElement('div');
  container.innerHTML = serverHtml;
  document.body.appendChild(container);
  // 속성 불일치는 복구 없이 console.error 경고로만 남는다(React 19) — 텍스트 불일치는 onRecoverableError 로 온다.
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];

  const root = await act(async () =>
    hydrateRoot(container, seededNoticeDetailTree(notice), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    }),
  );
  const hydratedText = container.textContent ?? '';
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
  return { serverHtml, hydratedText, recoverableErrors, hydrationWarnings, unhandledRequests };
}

describe('소식 상세 트리 — 하이드레이션(ISR HTML 회귀)', () => {
  it('운영형 시드로 그린 서버 HTML 을 불일치 없이 하이드레이션한다', async () => {
    const result = await hydrateSeededTree(noticeDetail);

    expect(result.serverHtml).toContain('중앙광장');
    expect(result.serverHtml).toContain('enter-content');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
    // 서버 HTML 에서 뺀 마감 D-day 가 하이드레이션 뒤에 붙는다 — 첫 프레임 다음 렌더까지 실제로 돌았다는 표지.
    expect(result.hydratedText).toContain('D-3');
  });

  it('마감이 지난 소식은 만료 배너를 하이드레이션 뒤에만 붙이고 불일치가 없다', async () => {
    // 마운트 재요청도 같은 만료 소식을 돌려줘야 배너가 재요청 결과로 사라지지 않는다.
    server.use(http.get('*/notices/42', () => envelope(expiredNoticeDetail)));

    const result = await hydrateSeededTree(expiredNoticeDetail);

    expect(result.serverHtml).not.toContain('마감된 공지');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
    expect(result.hydratedText).toContain('마감된 공지');
  });

  it('행사 소식(Intl 로 조립한 일시·외부 링크 바)도 불일치 없이 하이드레이션한다', async () => {
    // 마운트 재요청도 같은 행사 소식을 돌려줘야 행사 블록이 재요청 결과로 사라지지 않는다.
    server.use(http.get('*/notices/42', () => envelope(eventNoticeDetail)));

    const result = await hydrateSeededTree(eventNoticeDetail);

    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
    expect(result.hydratedText).toContain('9.25(금) 10:00–12:00');
  });

  // 운영 ISR HTML 은 최대 24시간 묵는다. 같은 시각 렌더로는 시각 의존 표시의 하이드레이션 게이트를 되돌려도 글자가 같아
  // 못 잡는다. 25시간은 KST 자정을 반드시 넘어 D-day 가 달라지고, 마감 지남 소식은 서버 시각엔 아직 마감 전이다.
  // 픽스처 시각은 import 때 실제 시계로 굳은 모듈 상수다 — 픽스처를 가짜 시계 안에서 만들면 서버·클라이언트가
  // 같이 밀려 판별력이 사라진다.
  it.each([
    ['일반', noticeDetail],
    ['마감 지남', expiredNoticeDetail],
    ['행사', eventNoticeDetail],
  ])('25시간 묵은 ISR HTML(어제 시각으로 렌더)도 불일치 없이 하이드레이션한다 — %s 소식', async (_label, notice) => {
    // 마운트 재요청도 같은 소식을 돌려줘야 시각 의존 표시가 재요청 결과로 바뀌지 않는다.
    server.use(http.get('*/notices/42', () => envelope(notice)));

    const result = await hydrateSeededTree(notice, Date.now() - 25 * 60 * 60 * 1000);

    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
  });
});
