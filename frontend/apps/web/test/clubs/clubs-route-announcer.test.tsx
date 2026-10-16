import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 동아리 라우트 공지 영역(스펙 P1 §3.6) — Next 공지기(트리가 바뀐 커밋에서 제목을 읽고 직전 값과 다를 때만 읽어 준다)가 놓치는
 * 인터셉트 전환만 알린다. 하네스는 실제 프레임처럼 상세(제목 훅)를 공지 영역 앞 형제로 둔다 — 같은 커밋에서 상세의 effect 가
 * 먼저 돈다. '뒤로' 는 모두 주소가 바뀐 popstate 다음 경로 커밋으로 재현한다(리스너가 그 popstate 에서 덮어쓰지 않는지 함께 본다).
 */

const { navigation } = vi.hoisted(() => ({ navigation: { pathname: '/clubs' } }));

// 경로는 렌더 때 읽는 값이다 — 테스트가 바꾼 뒤 rerender 해, 실제 라우터처럼 경로와 트리가 한 커밋에서 함께 바뀐다.
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSelectedLayoutSegment: () => null,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { useDocumentTitle } from '@/app/_lib/useDocumentTitle';
import { ROUTER_REFRESH_EVENT } from '@/app/_lib/useGuardedRouter';
import { ClubsRouteAnnouncer } from '@/app/clubs/_components/ClubsRouteAnnouncer';

const LIST_TITLE = '동아리 탐색 | 두잉';
const CLUB_TITLE = '밴드부 | 두잉';
const UNAVAILABLE_TITLE = '이 동아리는 지금 볼 수 없어요';

function DetailTitleProbe({ title }: { title: string | null }) {
  useDocumentTitle(title);
  return null;
}

type HarnessProps = {
  intercepted: boolean;
  /** 상세가 마운트돼 있으면 그 제목(데이터 전이면 null). undefined 면 상세 없음. */
  detailTitle?: string | null;
  /** 상세→상세에서 상세를 새로 마운트하려고 바꾼다. */
  detailKey?: string;
};

function Harness({ intercepted, detailTitle, detailKey }: HarnessProps) {
  return (
    <>
      {detailTitle !== undefined && <DetailTitleProbe key={detailKey} title={detailTitle} />}
      <ClubsRouteAnnouncer intercepted={intercepted} />
    </>
  );
}

const regionObservers: MutationObserver[] = [];

function renderAt(pathname: string, props: HarnessProps, wrap: (node: ReactNode) => ReactNode = (node) => node) {
  window.history.replaceState(null, '', pathname);
  navigation.pathname = pathname;
  const view = render(wrap(<Harness {...props} />));
  return { rerender: (next: HarnessProps) => view.rerender(wrap(<Harness {...next} />)) };
}

// 앞으로 — 주소를 쌓고 경로를 바꾼다(뒤따르는 rerender 가 그 경로 커밋이다).
function pushPath(pathname: string) {
  window.history.pushState(null, '', pathname);
  navigation.pathname = pathname;
}

// 뒤로 — 주소가 바뀐 popstate 를 먼저 낸다(실제 브라우저도 popstate 뒤에 라우터가 커밋한다).
function popToPath(pathname: string) {
  window.history.replaceState(null, '', pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
  navigation.pathname = pathname;
}

// 영역 글자가 바뀔 때마다 적는다(빈 글자 포함).
function recordRegion(): string[] {
  const region = screen.getByRole('status');
  const texts: string[] = [];
  const observer = new MutationObserver(() => texts.push(region.textContent ?? ''));
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  regionObservers.push(observer);
  return texts;
}

const announced = (texts: string[]) => texts.filter((text) => text !== '');

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

// 같은 주소에서 Next 공지기가 제목을 다시 읽는 두 경우 — 오버레이 닫기(같은 주소 popstate)·로그아웃(refresh).
const NEXT_REREADS: Array<[string, () => void]> = [
  ['주소가 그대로인 popstate(오버레이 닫기)', () => window.dispatchEvent(new PopStateEvent('popstate'))],
  ['refresh 신호(로그아웃)', () => window.dispatchEvent(new Event(ROUTER_REFRESH_EVENT))],
];

afterEach(() => {
  cleanup();
  regionObservers.splice(0).forEach((observer) => observer.disconnect());
  window.history.replaceState(null, '', '/');
  navigation.pathname = '/clubs';
});

describe('ClubsRouteAnnouncer — Next 공지기가 놓치는 인터셉트 전환만(스펙 P1 §3.6)', () => {
  it('늦은 진입 — 인터셉트 커밋 뒤 데이터가 와서 제목이 바뀌면 동아리 제목을 한 번, 뒤로(해제 커밋, 제목 복원)에서 목록 제목을 한 번 알린다', async () => {
    document.title = LIST_TITLE;
    const view = renderAt('/clubs', { intercepted: false });
    const texts = recordRegion();

    pushPath('/clubs/7');
    view.rerender({ intercepted: true, detailTitle: null });
    view.rerender({ intercepted: true, detailTitle: '밴드부' });
    await waitFor(() => expect(announced(texts)).toEqual([CLUB_TITLE]));

    popToPath('/clubs');
    view.rerender({ intercepted: false });
    expect(document.title).toBe(LIST_TITLE);
    await waitFor(() => expect(announced(texts)).toEqual([CLUB_TITLE, LIST_TITLE]));
  });

  it('하드 로드 상세(인터셉트 아님)에서 제목이 바뀌면 알리지 않는다 — Next 몫', async () => {
    document.title = '두잉 | 대구대학교 동아리 플랫폼';
    const view = renderAt('/clubs/7', { intercepted: false, detailTitle: null });
    const texts = recordRegion();

    view.rerender({ intercepted: false, detailTitle: '밴드부' });
    await settle();
    expect(document.title).toBe(CLUB_TITLE);
    expect(announced(texts)).toEqual([]);
  });

  it('커밋 전 선조회 진입(같은 커밋에서 상세가 먼저 제목을 바꿈) — 앞으로·뒤로 모두 알리지 않는다(둘 다 Next 몫)', async () => {
    document.title = LIST_TITLE;
    const view = renderAt('/clubs', { intercepted: false });
    const texts = recordRegion();

    pushPath('/clubs/7');
    view.rerender({ intercepted: true, detailTitle: '밴드부' });
    await settle();
    popToPath('/clubs');
    view.rerender({ intercepted: false });
    await settle();

    expect(document.title).toBe(LIST_TITLE);
    expect(announced(texts)).toEqual([]);
  });

  it.each(NEXT_REREADS)('늦은 진입 뒤 %s 가 있었으면 그 뒤로는 알리지 않는다 — Next 가 그때 동아리 제목을 읽어 뒤로를 알린다', async (_label, rereadByNext) => {
    document.title = LIST_TITLE;
    const view = renderAt('/clubs', { intercepted: false });
    const texts = recordRegion();
    pushPath('/clubs/7');
    view.rerender({ intercepted: true, detailTitle: null });
    view.rerender({ intercepted: true, detailTitle: '밴드부' });
    await waitFor(() => expect(announced(texts)).toEqual([CLUB_TITLE]));

    act(() => rereadByNext());
    popToPath('/clubs');
    view.rerender({ intercepted: false });
    await settle();

    expect(document.title).toBe(LIST_TITLE);
    expect(announced(texts)).toEqual([CLUB_TITLE]);
  });

  it('같은 문구가 이어지면(삭제된 동아리 → 다른 삭제된 동아리, 상세→상세) 영역을 비웠다가 다시 채워 두 번 다 읽힌다', async () => {
    const unavailableTitle = `${UNAVAILABLE_TITLE} | 두잉`;
    document.title = LIST_TITLE;
    const view = renderAt('/clubs', { intercepted: false });
    const texts = recordRegion();

    pushPath('/clubs/7');
    view.rerender({ intercepted: true, detailKey: '7', detailTitle: null });
    view.rerender({ intercepted: true, detailKey: '7', detailTitle: UNAVAILABLE_TITLE });
    await waitFor(() => expect(texts).toEqual([unavailableTitle]));

    pushPath('/clubs/8');
    view.rerender({ intercepted: true, detailKey: '8', detailTitle: null });
    await waitFor(() => expect(texts).toEqual([unavailableTitle, '']));
    view.rerender({ intercepted: true, detailKey: '8', detailTitle: UNAVAILABLE_TITLE });
    await waitFor(() => expect(texts).toEqual([unavailableTitle, '', unavailableTitle]));
  });

  it('StrictMode(dev 이중 effect)에서도 늦은 진입은 동아리 제목 한 번·뒤로는 목록 제목 한 번이다', async () => {
    document.title = LIST_TITLE;
    const strict = (node: ReactNode) => <StrictMode>{node}</StrictMode>;
    const view = renderAt('/clubs', { intercepted: false }, strict);
    const texts = recordRegion();

    pushPath('/clubs/7');
    view.rerender({ intercepted: true, detailTitle: null });
    view.rerender({ intercepted: true, detailTitle: '밴드부' });
    await waitFor(() => expect(announced(texts)).toEqual([CLUB_TITLE]));

    popToPath('/clubs');
    view.rerender({ intercepted: false });
    await waitFor(() => expect(announced(texts)).toEqual([CLUB_TITLE, LIST_TITLE]));
  });
});
