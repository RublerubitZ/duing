import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { StrictMode, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { clearNavigationPending } from '@/app/_lib/backDismiss';

/**
 * ClubsSlotFrame 판별 매트릭스(스펙 P1 §3.2 표·§5) — modal 경로(useSelectedLayoutSegments('modal'))·children 세그먼트로 children 을
 * 보임/숨겨 유지/렌더 안 함 중 하나로 그리고, 루트 표식(data-clubs-slot)과 숨은 목록 표식(data-clubs-hidden-list)을 단다.
 * 훅 값은 Next 16.3.8 실측 그대로다 — modal 경로 앞에 Next 내부 세그먼트 '(__SLOT__)' 가 끼고, 인터셉트((...)clubs/[clubId])는
 * '(...)clubs' 와 동아리 id 로, 하드 로드 상세·회원 화면에는 미러 그룹 '(passthrough)' 가 들어 있다. 판별은 fail-open 이라 모르는
 * 내부 세그먼트·기본값·숫자 아닌 id 는 인터셉트가 아니다(그 경우도 매트릭스에 있다).
 * next/navigation 의 훅들은 테스트가 바꾸는 탐색 상태 하나를 읽는다 — 실제 라우터처럼 한 번의 변경이 한 번의 커밋이다.
 */

type SlotNavigation = {
  pathname: string;
  /** useSelectedLayoutSegments('modal') 의 값(Next 내부 세그먼트 포함). */
  modalSegments: string[];
  /** useSelectedLayoutSegment() — children 의 첫 세그먼트(목록이면 null). */
  childSegment: string | null;
  /** modal 슬롯이 그리는 인터셉트 상세의 동아리 id — 목록 짝·기본값·미러는 비어 있어 null 이다. */
  modalDetailClubId: string | null;
};

const { navigationStore, routerMock } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let current: SlotNavigation = { pathname: '/clubs', modalSegments: ['(__SLOT__)'], childSegment: null, modalDetailClubId: null };
  return {
    navigationStore: {
      read: () => current,
      set: (next: SlotNavigation) => {
        current = next;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    // 렌더마다 새 객체면 useGuardedRouter 의 memo 가 깨져 가드 effect 가 재실행된다 — 참조를 고정한다(member-access-guard.test 와 같은 이유).
    routerMock: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore: useStore } = await import('react');
  const useNavigation = () => useStore(navigationStore.subscribe, navigationStore.read, navigationStore.read);
  return {
    useRouter: () => routerMock,
    usePathname: () => useNavigation().pathname,
    useSearchParams: () => new URLSearchParams(),
    // modal 경로는 복수형 훅으로만 읽는다 — 단수형 useSelectedLayoutSegment('modal') 은 경로의 마지막 세그먼트라 하드 로드 상세와
    // 인터셉트가 같은 id 다. 판별이 다른 슬롯·인자를 읽으면 바로 실패시킨다.
    useSelectedLayoutSegments: (parallelRouteKey?: string) => {
      const navigation = useNavigation();
      if (parallelRouteKey !== 'modal') throw new Error(`useSelectedLayoutSegments(${String(parallelRouteKey)}) — 'modal' 만 읽는다`);
      return navigation.modalSegments;
    },
    useSelectedLayoutSegment: (parallelRouteKey?: string) => {
      const navigation = useNavigation();
      if (parallelRouteKey !== undefined && parallelRouteKey !== 'children') {
        throw new Error(`useSelectedLayoutSegment('${parallelRouteKey}') — children 만 읽는다(modal 은 useSelectedLayoutSegments)`);
      }
      return navigation.childSegment;
    },
  };
});

import { MemberAccessGuard } from '@/app/clubs/[clubId]/member/_components/MemberAccessGuard';
import { ClubsSlotFrame } from '@/app/clubs/_components/ClubsSlotFrame';

const LIST: SlotNavigation = { pathname: '/clubs', modalSegments: ['(__SLOT__)'], childSegment: null, modalDetailClubId: null };
const hardDetail = (clubId: string): SlotNavigation => ({
  pathname: `/clubs/${clubId}`,
  modalSegments: ['(__SLOT__)', '(passthrough)', clubId],
  childSegment: clubId,
  modalDetailClubId: null,
});
// 하드 로드든, 인터셉트 상세에서 소프트 이동했든 회원 화면의 modal 경로는 같다.
const hardMember = (clubId: string): SlotNavigation => ({
  pathname: `/clubs/${clubId}/member/notices`,
  modalSegments: ['(__SLOT__)', '(passthrough)', clubId, 'member', 'notices'],
  childSegment: clubId,
  modalDetailClubId: null,
});
// 인터셉트 — modal 경로가 (...)clubs/[clubId] 의 '(...)clubs' 와 동아리 id 다. 밑의 children 세그먼트는 그대로다(목록이면 null, 회원
// 화면이면 그 화면의 id).
const intercepted = (clubId: string, childSegment: string | null): SlotNavigation => ({
  pathname: `/clubs/${clubId}`,
  modalSegments: ['(__SLOT__)', '(...)clubs', clubId],
  childSegment,
  modalDetailClubId: clubId,
});
// fail-open(스펙 P1 §3.2) — 인터셉트는 '(passthrough)' 가 없고 마지막 원소가 양의 정수 id 일 때뿐이다. 그 밖의 경로는 children
// 세그먼트로 가른다 — 모르는 Next 내부 세그먼트가 생겨도 목록·하드 로드 상세는 그려진다(빈 화면이 되지 않는다).
// (passthrough) 를 정해진 자리에서만 찾거나 접두어로 내부 세그먼트를 거르는 구현은 아래 둘째·셋째 경우에서 인터셉트로 오판한다.
const FAIL_OPEN_CASES: Array<[string, 'list' | 'page', SlotNavigation]> = [
  ['모르는 내부 세그먼트만 있는 목록', 'list', { ...LIST, modalSegments: ['(__UNKNOWN__)'] }],
  ['모르는 내부 세그먼트가 앞에 낀 하드 로드 상세', 'page', { ...hardDetail('5'), modalSegments: ['(__UNKNOWN__)', '(passthrough)', '5'] }],
  ['슬롯 루트 세그먼트가 없는 하드 로드 상세', 'page', { ...hardDetail('5'), modalSegments: ['(passthrough)', '5'] }],
  ['슬롯 루트 이름이 (__ 접두어 밖으로 바뀐 하드 로드 상세', 'page', { ...hardDetail('5'), modalSegments: ['(slot)', '(passthrough)', '5'] }],
  // 기본값 슬롯(@modal/default) — 앱 로더는 기본값으로 떨어진 슬롯을 '(__SLOT__)' 없이 '__DEFAULT__' 로 넣는다(소스 판독).
  ['기본값 슬롯(__DEFAULT__)인 하드 로드 상세', 'page', { ...hardDetail('5'), modalSegments: ['__DEFAULT__'] }],
  // 숫자 아닌 id 로 소프트 이동(앱 안에 그런 링크는 없다) — 인터셉트 라우트가 받아도 판별은 인터셉트가 아니다.
  [
    '마지막 원소가 숫자 아닌 인터셉트 경로(/clubs/abc)',
    'list',
    { pathname: '/clubs/abc', modalSegments: ['(__SLOT__)', '(...)clubs', 'abc'], childSegment: null, modalDetailClubId: 'abc' },
  ],
];

const navigateTo = (next: SlotNavigation) => act(() => navigationStore.set(next));

function useNavigation() {
  return useSyncExternalStore(navigationStore.subscribe, navigationStore.read, navigationStore.read);
}

const mountCounts = { list: 0, page: 0 };

function ListProbe() {
  useEffect(() => {
    mountCounts.list += 1;
  }, []);
  return <p data-testid="list-probe">동아리 목록</p>;
}

function PageProbe() {
  useEffect(() => {
    mountCounts.page += 1;
  }, []);
  return <p data-testid="page-probe">상세·회원 화면</p>;
}

// 실제 레이아웃처럼 children 은 지금 세그먼트가 고른다 — 목록(null)이면 목록, 아니면 상세·회원 화면.
function ChildrenProbe() {
  return useNavigation().childSegment === null ? <ListProbe /> : <PageProbe />;
}

// modal 슬롯 — 인터셉트일 때만 상세 셸이 있다(목록 짝·기본값·미러는 null).
function ModalProbe() {
  const { modalDetailClubId } = useNavigation();
  return modalDetailClubId === null ? null : <p data-testid="modal-probe">인터셉트 상세 {modalDetailClubId}</p>;
}

function renderFrame(children: ReactNode = <ChildrenProbe />) {
  return render(<ClubsSlotFrame modal={<ModalProbe />}>{children}</ClubsSlotFrame>);
}

function frameRoot(): HTMLElement {
  const root = document.querySelector('[data-clubs-slot]');
  if (!(root instanceof HTMLElement)) throw new Error('data-clubs-slot 루트가 없다');
  return root;
}

/**
 * 숨겨 유지하는 목록 래퍼의 계약 — display:none(hidden) 대신 모바일은 화면에 고정한 채 레이아웃 크림 배경 뒤(음수 z-index)에 그려 두고
 * (그 위를 불투명 크림 막이 덮는다), md 이상은 display:none 이다. inert 로 스크린리더·탭 이동·찾기·포인터에서 빼고, 안쪽의 view-transition-name 은 모두 끈다.
 * jsdom 은 Tailwind CSS 를 적용하지 않아 실제로 가려졌는지는 웹킷 E2E(clubs-native-back.webkit.spec.ts)가 본다.
 */
function expectKeptHidden(listWrapper: HTMLElement | null) {
  expect(listWrapper).toHaveAttribute('data-clubs-hidden-list', 'true');
  expect(listWrapper).toHaveAttribute('inert');
  expect(listWrapper).not.toHaveAttribute('hidden');
  expect(listWrapper).toHaveClass(
    'max-md:fixed',
    'max-md:inset-0',
    'max-md:-z-10',
    'max-md:overflow-clip',
    'md:hidden',
    '[&_*]:![view-transition-name:none]',
    // 바운스로 레이아웃 배경 바깥이 드러날 때 목록 대신 보이는 불투명 크림 막.
    'max-md:after:absolute',
    'max-md:after:inset-0',
    'max-md:after:z-50',
    'max-md:after:bg-cream',
  );
}

afterEach(() => {
  cleanup();
  navigationStore.set(LIST);
  routerMock.replace.mockReset();
  mountCounts.list = 0;
  mountCounts.page = 0;
  clearNavigationPending();
});

describe('ClubsSlotFrame — 판별 매트릭스(스펙 P1 §3.2)', () => {
  it('목록(/clubs) — 표식 list, 목록을 숨기지 않고 그린다', () => {
    navigationStore.set(LIST);
    renderFrame();

    expect(frameRoot()).toHaveAttribute('data-clubs-slot', 'list');
    expect(screen.getByTestId('list-probe')).toBeVisible();
    expect(document.querySelector('[data-clubs-hidden-list]')).toBeNull();
  });

  it.each([
    ['하드 로드 상세', hardDetail('5')],
    ['하드 로드 회원 화면', hardMember('5')],
    ['숫자 아닌 id 하드 로드(/clubs/abc — 상세 라우트가 받는다)', hardDetail('abc')],
  ])('%s — 표식 page, children 이 보이고 modal(미러)은 비어 있다', (_label, navigation) => {
    navigationStore.set(navigation);
    renderFrame();

    expect(frameRoot()).toHaveAttribute('data-clubs-slot', 'page');
    expect(screen.getByTestId('page-probe')).toBeVisible();
    expect(screen.queryByTestId('modal-probe')).toBeNull();
  });

  it.each(FAIL_OPEN_CASES)(
    'fail-open — %s: 인터셉트로 가르지 않고 children 세그먼트로 가른다(표식 %s), children 을 숨기지 않는다',
    (_label, expectedSlot, navigation) => {
      navigationStore.set(navigation);
      renderFrame();

      expect(frameRoot()).toHaveAttribute('data-clubs-slot', expectedSlot);
      expect(screen.getByTestId(expectedSlot === 'list' ? 'list-probe' : 'page-probe')).toBeVisible();
      expect(document.querySelector('[data-clubs-hidden-list]')).toBeNull();
    },
  );

  it('목록 → 인터셉트 → 상세→상세 → 목록 — 목록을 같은 노드로 숨긴 채 유지하고(모바일은 그려 둔 채 덮기·inert), 상세는 그 뒤 문서 흐름에 그린다', () => {
    navigationStore.set(LIST);
    renderFrame();
    const listNode = screen.getByTestId('list-probe');
    const listWrapper = listNode.parentElement;

    navigateTo(intercepted('5', null));
    expect(frameRoot()).toHaveAttribute('data-clubs-slot', 'intercepted');
    expect(screen.getByTestId('list-probe')).toBe(listNode);
    expect(listNode.parentElement).toBe(listWrapper);
    expectKeptHidden(listWrapper);
    const modal = screen.getByTestId('modal-probe');
    expect(modal).toBeVisible();
    // 고정 오버레이가 아니라 children 래퍼 뒤의 형제 흐름이다.
    expect((listWrapper?.compareDocumentPosition(modal) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    navigateTo(intercepted('6', null));
    expect(screen.getByTestId('modal-probe')).toHaveTextContent('6');
    expect(screen.getByTestId('list-probe')).toBe(listNode);
    expectKeptHidden(listWrapper);

    navigateTo(LIST);
    expect(frameRoot()).toHaveAttribute('data-clubs-slot', 'list');
    expect(screen.getByTestId('list-probe')).toBe(listNode);
    expect(listNode.parentElement).toBe(listWrapper);
    expect(listWrapper).not.toHaveAttribute('inert');
    expect(listWrapper).not.toHaveAttribute('class');
    expect(listNode).toBeVisible();
    expect(document.querySelector('[data-clubs-hidden-list]')).toBeNull();
    expect(mountCounts.list).toBe(1);
  });

  // 판별은 경로의 마지막 원소를 본다 — 앞에 모르는 내부 세그먼트가 하나 더 끼거나, Next 가 경로 모양을 다시 바꿔 인터셉트 폴더
  // 세그먼트가 빠져도(옛 (.)[clubId] 실측 모양) 인터셉트를 놓치지 않는다(스펙 P1 §3.2 fail-open).
  it.each([
    ['앞에 모르는 내부 세그먼트가 낀 인터셉트 경로', ['(__UNKNOWN__)', '(__SLOT__)', '(...)clubs', '5']],
    ['인터셉트 폴더 세그먼트가 없는 옛 모양 경로', ['(__SLOT__)', '5']],
  ])('%s — 인터셉트다, 목록을 숨기고 상세를 그린다', (_label, modalSegments) => {
    navigationStore.set(LIST);
    renderFrame();
    const listNode = screen.getByTestId('list-probe');

    navigateTo({ ...intercepted('5', null), modalSegments });
    expect(frameRoot()).toHaveAttribute('data-clubs-slot', 'intercepted');
    expect(screen.getByTestId('list-probe')).toBe(listNode);
    expectKeptHidden(listNode.parentElement);
    expect(screen.getByTestId('modal-probe')).toBeVisible();
  });

  it.each([
    ['하드 로드 상세', hardDetail('5')],
    ['회원 화면', hardMember('5')],
  ])('%s 위로 다른 상세가 인터셉트되면 children 을 렌더하지 않고(언마운트), 뒤로 오면 다시 마운트한다', (_label, page) => {
    navigationStore.set(page);
    renderFrame();
    expect(mountCounts.page).toBe(1);

    navigateTo(intercepted('6', '5'));
    expect(frameRoot()).toHaveAttribute('data-clubs-slot', 'intercepted');
    expect(screen.queryByTestId('page-probe')).toBeNull();
    expect(document.querySelector('[data-clubs-hidden-list]')).toBeNull();
    expect(screen.getByTestId('modal-probe')).toBeVisible();

    navigateTo(page);
    expect(screen.getByTestId('page-probe')).toBeVisible();
    expect(mountCounts.page).toBe(2);
  });

  it('목록이 언마운트된 채 돌아온 인터셉트 엔트리 — 목록 → 회원 화면 → 인터셉트(children 은 목록) → 목록 순서에서 목록을 숨긴 채 새로 마운트하지 않는다', () => {
    navigationStore.set(LIST);
    renderFrame();
    expect(mountCounts.list).toBe(1);

    navigateTo(hardMember('5'));
    expect(screen.queryByTestId('list-probe')).toBeNull();

    // 회원 화면 → 뒤로 — 앞서 열었던 인터셉트 엔트리가 복원된다(children 은 목록 세그먼트지만 지금 마운트돼 있지 않다).
    navigateTo(intercepted('5', null));
    expect(frameRoot()).toHaveAttribute('data-clubs-slot', 'intercepted');
    expect(screen.queryByTestId('list-probe')).toBeNull();
    expect(document.querySelector('[data-clubs-hidden-list]')).toBeNull();
    expect(mountCounts.list).toBe(1);

    // 마지막 뒤로 — 목록은 보이는 상태로 새로 마운트된다(현행과 같은 재마운트).
    navigateTo(LIST);
    expect(screen.getByTestId('list-probe')).toBeVisible();
    expect(mountCounts.list).toBe(2);
  });

  it('StrictMode(dev 이중 effect)에서 인터셉트 엔트리로 처음 마운트해도 목록을 숨긴 채 새로 마운트하지 않는다 — 다른 화면에서 뒤로 들어온 엔트리', () => {
    navigationStore.set(intercepted('5', null));
    render(
      <StrictMode>
        <ClubsSlotFrame modal={<ModalProbe />}>
          <ChildrenProbe />
        </ClubsSlotFrame>
      </StrictMode>,
    );
    expect(frameRoot()).toHaveAttribute('data-clubs-slot', 'intercepted');
    expect(screen.queryByTestId('list-probe')).toBeNull();
    expect(screen.getByTestId('modal-probe')).toBeVisible();

    navigateTo(LIST);
    const listNode = screen.getByTestId('list-probe');
    expect(listNode).toBeVisible();

    // 그 뒤 인터셉트는 같은 노드로 숨긴다(커밋 뒤 갱신이 두 번 돌아도 같은 값).
    navigateTo(intercepted('6', null));
    expect(screen.getByTestId('list-probe')).toBe(listNode);
    expectKeptHidden(listNode.parentElement);
  });

  it('라우트 공지 영역은 프레임 루트의 마지막 자식이다 — 같은 커밋에서 상세의 effect 뒤에 돈다(스펙 P1 §3.6)', () => {
    navigationStore.set(LIST);
    renderFrame();

    const lastChild = frameRoot().lastElementChild;
    expect(lastChild).toHaveAttribute('role', 'status');
    expect(lastChild).toHaveClass('sr-only');
    expect(lastChild).not.toHaveAttribute('aria-live');
  });
});

describe('ClubsSlotFrame — 거부된 회원 화면의 replace(스펙 P1 §4)', () => {
  const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
  // 비멤버 — 200 + data:null 은 거부다(MemberAccessGuard).
  const server = setupServer(
    http.get('*/clubs/1/membership', () => HttpResponse.json({ ok: true, message: null, data: null })),
  );
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  it('가드의 replace(/clubs/1)가 인터셉트돼도 밑의 회원 화면을 언마운트해 replace·토스트가 각각 한 번이다', async () => {
    navigationStore.set(hardMember('1'));
    routerMock.replace.mockImplementation(() => {
      // 실제 라우터처럼 — 회원 화면 주소의 Next-Url 이 인터셉트 헤더 정규식에 맞아 /clubs/1 이 modal 로 열리고, 커밋 통지는 그 렌더
      // 뒤 다음 틱에 온다(예약 → 렌더 → 커밋 통지). 같은 호출에서 풀면 예약 상태가 한 번도 렌더되지 않아 숨겨 유지한 회귀를 못 잡는다.
      navigationStore.set(intercepted('1', '1'));
      setTimeout(clearNavigationPending, 0);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>
          <ToastProvider>
            <ClubsSlotFrame modal={<ModalProbe />}>
              <MemberAccessGuard clubId={1}>
                <p>회원 전용 콘텐츠</p>
              </MemberAccessGuard>
            </ClubsSlotFrame>
          </ToastProvider>
        </ApiClientProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('modal-probe')).toBeInTheDocument());
    // 이어지는 커밋 통지가 다시 가드를 깨우지 않는지 잠깐 더 본다 — 숨겨 유지하면 예약이 풀릴 때마다 가드 effect 가 다시 돌아
    // replace 가 2회 이상이 된다.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
    expect(routerMock.replace).toHaveBeenCalledWith('/clubs/1');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('회원 전용 페이지입니다. 동아리 소개 페이지로 이동합니다.');
    expect(screen.queryByText('회원 전용 콘텐츠')).toBeNull();
  });
});
