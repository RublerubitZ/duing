import { waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClubHeroActivity } from '@duing/types';

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

// framer-motion(motion-dom) 은 isBrowser 를 모듈 로드 때 굳히고 initPrefersReducedMotion 에서 window.matchMedia 를
// 재검사 없이 읽는다 — window 를 지운 서버 흉내 렌더에서 대표 활동 섹션(시드가 있으면 서버에서 그린다)의 ClubHeroSwipe·
// PhotoLightbox 가 부르는 useReducedMotion 이 TypeError 로 죽는다. 운영 서버는 모듈 로드 때부터 window 가 없어(isBrowser=false)
// 이 경로를 타지 않고 null 을 받는다. 그래서 값을 바꿔 끼우되, 서버 흉내에는 null, 하이드레이션에는 true(동작 줄이기를 켠
// 브라우저)를 줘 운영의 갈림을 재현한다 — 이 값을 렌더 출력에 쓰기 시작하면 불일치로 잡힌다.
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => (typeof window === 'undefined' ? null : true),
}));

import { clubDetail, seededClubDetailTree, type SeededTreeOptions } from './club-detail-tree-fixture';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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
// 케이스가 server.use 로 바꾼 핸들러(대표 활동 응답 붙잡기 등)를 다음 케이스로 넘기지 않는다.
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom 에는 window·document 가 있다 — 지우지 않으면 typeof window 분기가 서버 렌더에서도 브라우저 쪽을 타
// 불일치를 못 잡는다. 모듈 로드 때 굳는 판정(라이브러리의 isServer 등)까지 서버로 돌리지는 못한다.
// serverNow 를 주면 서버 렌더만 그 시각으로 돌린다 — 가짜로 두는 건 Date 뿐이고 끝나면 실제 시계로 되돌린다.
function renderAsServer(serverNow?: number, treeOptions?: SeededTreeOptions): string {
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('document', undefined);
  try {
    if (serverNow !== undefined) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(serverNow);
    }
    return renderToString(seededClubDetailTree(treeOptions));
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
}

type HydrateOptions = {
  /** 상세 트리 픽스처 옵션 — 대표 활동 시드 등. */
  treeOptions?: SeededTreeOptions;
  /** 하이드레이션 뒤·언마운트 전에 돈다 — 마운트 재요청 뒤의 화면을 볼 때. 여기서 생긴 경고도 함께 센다. */
  whileMounted?: (container: HTMLElement) => Promise<void>;
};

/** 서버 흉내 렌더 → 하이드레이션 뒤 텍스트와 불일치·미처리 요청 신호를 모은다. 하이드레이션은 실제 시계로 돈다. */
async function hydrateSeededTree(serverNow?: number, { treeOptions, whileMounted }: HydrateOptions = {}) {
  const serverHtml = renderAsServer(serverNow, treeOptions);
  const container = document.createElement('div');
  container.innerHTML = serverHtml;
  document.body.appendChild(container);
  // 속성 불일치는 복구 없이 console.error 경고로만 남는다(React 19) — 텍스트 불일치는 onRecoverableError 로 온다.
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];

  const root = await act(async () =>
    hydrateRoot(container, seededClubDetailTree(treeOptions), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    }),
  );
  const hydratedText = container.textContent ?? '';
  try {
    await whileMounted?.(container);
    const hydrationWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      /hydrat/i.test(args.map(String).join(' ')),
    );
    // msw 의 onUnhandledRequest:'error' 는 console.error 로만 알린다 — 위 스파이가 삼키므로 여기서 직접 본다.
    const unhandledRequests = consoleErrorSpy.mock.calls.filter((args) =>
      /matching request handler/.test(args.map(String).join(' ')),
    );
    return { serverHtml, hydratedText, recoverableErrors, hydrationWarnings, unhandledRequests };
  } finally {
    act(() => root.unmount());
    consoleErrorSpy.mockRestore();
    container.remove();
  }
}

describe('동아리 상세 트리 — 하이드레이션(ISR HTML 회귀)', () => {
  it('운영형 시드로 그린 서버 HTML 을 불일치 없이 하이드레이션한다', async () => {
    const result = await hydrateSeededTree();

    expect(result.serverHtml).toContain('함께 운동해요');
    // 앞으로 들어온 렌더라 서버 HTML 에 본문 등장 클래스가 실린다 — 첫 화면에서 CSS 로 재생되고, 하이드레이션도 같은 값이라 경고가 없다.
    expect(result.serverHtml).toContain('enter-content');
    // 시드(updatedAt 0)여도 열린 모집의 지원 버튼은 확인 중 스피너 없이 열린 채 그린다(안전은 누를 때의 재확인이 지킨다) —
    // 하이드레이션 첫 프레임도 시드라 같은 값이다. 누르기 전 스피너가 돌아오면 서버 HTML 에 이 이름이 다시 실린다.
    expect(result.serverHtml).not.toContain('aria-label="모집 정보 확인 중"');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
    // 서버 HTML 에서 뺀 D-day 가 하이드레이션 뒤에 붙는다 — 첫 프레임 다음 렌더까지 실제로 돌았다는 표지.
    expect(result.hydratedText).toContain('모집중 · D-3');
  });

  // 운영 ISR HTML 은 최대 7일 묵는다. 같은 시각 렌더로는 모집 D-day 의 하이드레이션 게이트를 되돌려도 글자가 같아
  // 못 잡는다. 25시간은 KST 자정을 반드시 넘어 D-day 가 달라진다.
  // 픽스처 시각은 import 때 실제 시계로 굳은 모듈 상수다 — 픽스처를 가짜 시계 안에서 만들면 서버·클라이언트가
  // 같이 밀려 판별력이 사라진다.
  it('25시간 묵은 ISR HTML(어제 시각으로 렌더)도 불일치 없이 하이드레이션한다', async () => {
    const result = await hydrateSeededTree(Date.now() - 25 * 60 * 60 * 1000);

    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
  });
});

describe('동아리 상세 트리 — 대표 활동 시드(#1457)', () => {
  const heroActivities: ClubHeroActivity[] = [
    {
      id: 1,
      clubPhotoId: 10,
      storageKey: 'https://files.duings.com/club/photo/hero-1.jpg',
      caption: null,
      width: null,
      height: null,
      title: '정기 공연',
      description: '매 학기 무대',
      displayOrder: 1,
    },
  ];

  it('시드가 있으면 서버 HTML 에 섹션만 싣고, 이미지는 대표 활동 재요청 응답 뒤에 붙인다', async () => {
    // 재요청 응답을 붙잡아 둔다 — 그동안 이미지가 없어야 develop 과 같은 순서(대표 활동 응답 → 이미지)다.
    let releaseHeroActivities: () => void = () => {};
    const heroActivitiesReleased = new Promise<void>((resolve) => {
      releaseHeroActivities = resolve;
    });
    let heroActivitiesRequested = false;
    // 상세 재요청은 이름이 다른 상세로 답한다 — 그 이름이 화면에 보이면 상세가 반영된 것이다. 지원 버튼은 스냅샷에서도
    // 열려 있어(색 유지) 더는 상세 반영의 표지가 아니다.
    const latestDetailName = '모션케어·최신';
    server.use(
      http.get('*/clubs/1', () => envelope({ ...clubDetail, name: latestDetailName })),
      http.get('*/clubs/1/hero-activities', async () => {
        heroActivitiesRequested = true;
        await heroActivitiesReleased;
        return envelope(heroActivities);
      }),
    );
    let imageShownBeforeResponse = true;

    const result = await hydrateSeededTree(undefined, {
      treeOptions: { heroActivities },
      whileMounted: async (container) => {
        // 하이드레이션 직후 한 시점만 보면, 다른 비동기 사건(상세 재요청 성공 등)에 묶인 게이트로 회귀해도 타이밍에 따라 통과한다.
        // 대표 활동 요청이 도착하고 상세 재요청이 화면에 반영된(바뀐 이름이 보인) 뒤까지 이미지가 없는지 본다.
        try {
          await waitFor(() => {
            expect(heroActivitiesRequested).toBe(true);
            expect(container.textContent).toContain(latestDetailName);
          });
          imageShownBeforeResponse = container.querySelector('img[src$="hero-1.jpg"]') !== null;
        } finally {
          // 대기가 실패해도 붙잡은 응답을 푼다 — 안 풀면 요청이 케이스가 끝난 뒤에도 API 클라이언트 타임아웃(10초)까지 남는다.
          releaseHeroActivities();
        }
        await waitFor(() => expect(container.querySelector('img[src$="hero-1.jpg"]')).not.toBeNull());
      },
    });

    expect(result.serverHtml).toContain('동아리의 다양한 활동과 분위기를 만나보세요.');
    expect(result.serverHtml).toContain('정기 공연');
    expect(result.serverHtml).not.toContain('대표 활동 불러오는 중');
    expect(result.serverHtml).not.toContain('hero-1.jpg');
    expect(imageShownBeforeResponse).toBe(false);
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
  });

  it('시드가 0개면 서버 HTML 에 섹션도 스켈레톤도 없고 불일치 없이 하이드레이션한다', async () => {
    const result = await hydrateSeededTree(undefined, { treeOptions: { heroActivities: [] } });

    expect(result.serverHtml).not.toContain('동아리의 다양한 활동과 분위기를 만나보세요.');
    expect(result.serverHtml).not.toContain('대표 활동 불러오는 중');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
  });
});
