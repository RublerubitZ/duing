import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NoticeCardItem, PageResponse } from '@duing/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/notices',
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
}));

import { kstWallClock } from './kst-wall-clock';
import { noticeListPage, seededNoticeListTree } from './notice-list-tree-fixture';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function envelope(data: unknown) {
  return HttpResponse.json({ ok: true, message: null, data });
}

// 하이드레이션 뒤 마운트 재요청이 실제 네트워크로 나가지 않게 막는다(시드와 같은 목록을 돌려준다).
const server = setupServer(http.get('*/notices', () => envelope(noticeListPage)));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom 에는 window·document 가 있다 — 지우지 않으면 typeof window 분기가 서버 렌더에서도 브라우저 쪽을 타
// 불일치를 못 잡는다. 모듈 로드 때 굳는 판정(라이브러리의 isServer 등)까지 서버로 돌리지는 못한다.
// serverNow 를 주면 서버 렌더만 그 시각으로 돌린다 — 가짜로 두는 건 Date 뿐이고 끝나면 실제 시계로 되돌린다.
function renderAsServer(page: PageResponse<NoticeCardItem>, serverNow?: number): string {
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('document', undefined);
  try {
    if (serverNow !== undefined) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(serverNow);
    }
    return renderToString(seededNoticeListTree(page));
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
}

/** 서버 흉내 렌더 → 하이드레이션 뒤 HTML 과 불일치·미처리 요청 신호를 모은다. 하이드레이션은 실제 시계로 돈다. */
async function hydrateSeededTree(page: PageResponse<NoticeCardItem>, serverNow?: number) {
  const serverHtml = renderAsServer(page, serverNow);
  const container = document.createElement('div');
  container.innerHTML = serverHtml;
  document.body.appendChild(container);
  // 속성 불일치는 복구 없이 console.error 경고로만 남는다(React 19) — 텍스트 불일치는 onRecoverableError 로 온다.
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];

  const root = await act(async () =>
    hydrateRoot(container, seededNoticeListTree(page), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    }),
  );
  const hydratedHtml = container.innerHTML;
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
  return { serverHtml, hydratedHtml, recoverableErrors, hydrationWarnings, unhandledRequests };
}

const DAY_MS = 86_400_000;
// 운영 목록 ISR 은 24시간 주기라 하루 넘게 묵은 HTML 이 흔하다 — 25시간이면 KST 자정을 반드시 넘는다.
const STALE_ISR_MS = 25 * 60 * 60 * 1000;

// NEW(작성 7일 이내) 경계에 걸친 소식 — 작성 7.5일 전이라 25시간 전 서버 시각으로는 NEW 고 지금은 아니다.
// 마감도 12시간 전이라 서버 시각에는 마감 전이고 지금은 지났다(expiresAt 은 오프셋 없는 KST 벽시계).
// 픽스처 시각은 import 때 실제 시계로 굳은 모듈 상수다 — 가짜 시계 안에서 만들면 서버·클라이언트가 같이 밀려 판별력이 사라진다.
const newBoundaryNotice: NoticeCardItem = {
  id: 23,
  title: '동아리 대표자 회의 결과',
  summary: '회의 안건과 결정 사항',
  coverImageUrl: 'https://files.duings.com/notice/cover.jpg',
  linkUrl: null,
  category: 'GENERAL',
  tags: [],
  pinned: false,
  expiresAt: kstWallClock(-12 * 60 * 60 * 1000),
  createdAt: new Date(Date.now() - 7.5 * DAY_MS).toISOString(),
  owningClubId: null,
  clubName: null,
};

// 지금 시각에 따라 바뀌는 값을 가진 페이지 — 경계 소식(NEW·마감 지남)과 3일 뒤 마감 소식 두 건(고정 강조 카드·행 목록,
// D-day 가 하루 이상 달라진다).
// 목록이 지금 그런 값을 그리지 않더라도, 행에 새로 생기면 게이트 없이는 이 케이스가 깨진다.
const pageWithTimeDependentValues: PageResponse<NoticeCardItem> = {
  ...noticeListPage,
  content: [
    ...noticeListPage.content.map((item) =>
      item.id === 1 || item.id === 7 ? { ...item, expiresAt: kstWallClock(3 * DAY_MS) } : item,
    ),
    newBoundaryNotice,
  ],
  totalElements: noticeListPage.totalElements + 1,
};

describe('소식 목록 트리 — 하이드레이션(ISR HTML 회귀)', () => {
  it('시드된 첫 페이지를 불일치 없이 하이드레이션하고, NEW 배지는 그 뒤에 붙는다', async () => {
    const result = await hydrateSeededTree(noticeListPage);

    // 앞으로 들어온 렌더라 서버 HTML 에 목록 등장 클래스가 실린다(하이드레이션도 같은 값).
    expect(result.serverHtml).toContain('enter-content');
    expect(result.serverHtml).not.toContain('>NEW<');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
    // 서버 HTML 에서 뺀 NEW 배지가 하이드레이션 뒤 고정 카드·행 목록 두 곳에 붙는다 — 30일 전 소식은 대조군이라 붙지 않는다.
    expect(result.hydratedHtml.match(/>NEW</g) ?? []).toHaveLength(2);
  });

  // 같은 시각 렌더는 불일치가 나지 않아 단언 없는 시각 의존 표시를 못 잡는다 — 서버 렌더만 25시간 전으로 돌린다.
  it('25시간 묵은 ISR HTML(어제 시각으로 렌더)도 불일치 없이 하이드레이션한다', async () => {
    const serverNow = Date.now() - STALE_ISR_MS;
    // 경계 소식이 서버 시각에는 NEW 여야 판별력이 있다 — 픽스처가 경계에서 벗어나면 이 케이스가 조용히 무력해진다.
    expect(Date.parse(newBoundaryNotice.createdAt)).toBeGreaterThan(serverNow - 7 * DAY_MS);
    // 마운트 재요청도 같은 페이지를 돌려줘야 하이드레이션 뒤 목록이 재요청 결과로 바뀌지 않는다.
    server.use(http.get('*/notices', () => envelope(pageWithTimeDependentValues)));

    const result = await hydrateSeededTree(pageWithTimeDependentValues, serverNow);

    expect(result.serverHtml).toContain('동아리 대표자 회의 결과');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
    // 경계 소식은 지금 기준 7일이 지나 NEW 가 붙지 않는다 — 막 올라온 두 건만.
    expect(result.hydratedHtml.match(/>NEW</g) ?? []).toHaveLength(2);
  });
});
