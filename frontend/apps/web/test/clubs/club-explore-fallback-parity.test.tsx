import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys } from '@duing/hooks';

/**
 * 드리프트 가드 — 서버 기본 목록(ClubExploreFallback)과, JS 가 그것을 이어받는 순간의 실제 화면(시드 마운트)이 첫 카드
 * 자리를 같게 그리는지. 공용 상수 밖에서 손으로 맞춘 행(섹션·제목 블록·검색 자리 틀·레일 틀·목록 래퍼)이 한쪽만 바뀌면
 * 교체 순간 카드가 움직인다. 두 트리를 따로 렌더해 태그·클래스로 비교한다(실제 크기는 브라우저 실측의 몫).
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

import { ClubExploreFallback } from '@/app/clubs/_components/ClubExploreFallback';
import { DEFAULT_EXPLORE_PARAMS, EXPLORE_PAGE_SIZE, toApiParams } from '@/app/clubs/_lib/exploreParams';
import { ClubExplorePage } from '@/app/clubs/_pages/ClubExplorePage';

import { clubListPage } from './club-explore-fallback-fixture';

const BASE = 'http://localhost:8080/api/v1';
// 마운트 요청 — 시드가 stale(updatedAt 0)이라 다시 받는 목록과 모바일 모집 중 카운트(size 1). 익명이라 찜 ids 는 나가지 않는다.
const server = setupServer(
  http.get(`${BASE}/clubs`, () => HttpResponse.json({ ok: true, data: clubListPage, message: null })),
);
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

const FIRST_CARD_HREF = `/clubs/${clubListPage.content[0]?.id}`;

const indent = (depth: number, text: string) => `${'  '.repeat(depth)}${text}`;

const describeElement = (element: Element) =>
  `${element.tagName.toLowerCase()} "${element.getAttribute('class') ?? ''}"`;

// 회색 자리 — 실제 화면의 검색 폼·필터 사이드바를 fallback 은 빈 회색 상자로 그린다. 일부러 다른 자리라 하위는 접고
// 자리의 위치만 비교한다.
const isPlaceholderSlot = (element: Element) =>
  element.tagName === 'FORM' || element.tagName === 'ASIDE' || element.classList.contains('animate-pulse');

function outlineSubtree(element: Element, depth: number): string[] {
  if (isPlaceholderSlot(element)) return [indent(depth, '(회색 자리)')];
  return [
    indent(depth, describeElement(element)),
    ...Array.from(element.children).flatMap((child) => outlineSubtree(child, depth + 1)),
  ];
}

/**
 * 첫 카드 자리를 정하는 것을 문서 순서대로 펼친다 — 레이아웃 루트에서 카드 링크 바로 위까지의 조상(▸)과, 각 조상 앞에
 * 놓인 형제(카드 위 행)의 하위 트리. 링크 자신은 양쪽이 같은 카드 컴포넌트·같은 데이터라 뺀다.
 */
function outlineAboveFirstCard(layoutRoot: Element): string[] {
  const firstCardLink = layoutRoot.querySelector(`a[href="${FIRST_CARD_HREF}"]`);
  if (firstCardLink === null) throw new Error(`${describeElement(layoutRoot)} 에 첫 카드 링크(${FIRST_CARD_HREF})가 없다`);
  const ancestors: Element[] = [];
  for (let node = firstCardLink.parentElement; node !== null && node !== layoutRoot; node = node.parentElement) {
    ancestors.unshift(node);
  }
  return [
    indent(0, `▸ ${describeElement(layoutRoot)}`),
    ...ancestors.flatMap((ancestor, index) => {
      const siblings = Array.from(ancestor.parentElement?.children ?? []);
      return [
        ...siblings.slice(0, siblings.indexOf(ancestor)).flatMap((row) => outlineSubtree(row, index + 1)),
        indent(index + 1, `▸ ${describeElement(ancestor)}`),
      ];
    }),
  ];
}

// 비교 범위는 레이아웃 루트까지 — 페이지 루트의 두 자식(데스크탑 hidden md:block · 모바일 md:hidden)이다. 서로 다른 폭에서만
// 보이므로 따로 펼친다. 실제 화면을 감싼 Provider 들은 DOM 을 남기지 않아 페이지 루트가 곧 렌더 컨테이너의 첫 자식이다.
function outlineLayouts(container: HTMLElement): { desktop: string[]; mobile: string[] } {
  const [desktopRoot, mobileRoot] = Array.from(container.firstElementChild?.children ?? []);
  if (desktopRoot === undefined || mobileRoot === undefined) throw new Error('레이아웃 루트(데스크탑·모바일)가 없다');
  return { desktop: outlineAboveFirstCard(desktopRoot), mobile: outlineAboveFirstCard(mobileRoot) };
}

/** 실제 화면 — 서버가 시드한 첫 진입 키를 들고 쿼리 없이 마운트한다. 펼침은 교체 순간(첫 커밋)의 화면이다. */
async function outlineSeededPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    clubQueryKeys.list(toApiParams(DEFAULT_EXPLORE_PARAMS, EXPLORE_PAGE_SIZE)),
    clubListPage,
    { updatedAt: 0 },
  );
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ClubExplorePage />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  const outlines = outlineLayouts(container);
  // 마운트 요청이 테스트 밖으로 새지 않게 응답까지 받고 끝낸다.
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  return outlines;
}

const outlineFallback = () => outlineLayouts(render(<ClubExploreFallback page={clubListPage} />).container);

describe('ClubExploreFallback ↔ 실제 화면(시드 마운트) — 첫 카드 자리', () => {
  it('데스크탑 — 카드까지의 조상과 그 위 행이 같다(시드 마운트라 카드 래퍼에 스태거가 붙지 않는다)', async () => {
    const seededPage = await outlineSeededPage();

    expect(seededPage.desktop).toEqual(outlineFallback().desktop);
  });

  it('모바일 — 같고, 실제 화면만 행마다 클래스 없는 스태거 래퍼를 하나 더 둔다', async () => {
    const seededPage = await outlineSeededPage();

    // 시드 마운트라 래퍼에 연출(enter-stagger)이 없어야 한다. 클래스 없는 블록 래퍼라 세로 플렉스 목록에서 상자가 같다.
    expect(seededPage.mobile).toEqual([...outlineFallback().mobile, indent(3, '▸ div ""')]);
  });
});
