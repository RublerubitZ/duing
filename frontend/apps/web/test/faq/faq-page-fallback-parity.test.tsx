import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, federationFaqQueryKeys } from '@duing/hooks';

/**
 * 드리프트 가드 — 서버 기본 목록(FaqPageFallback)과, JS 가 그것을 이어받는 순간의 실제 화면(시드 마운트)이 첫 행 자리를
 * 같게 그리는지. 공용 상수(faqUi) 밖에서 손으로 맞춘 부분(최상위 div·max-w-layout 래퍼·제목 블록)이 한쪽만 바뀌면 교체
 * 순간 목록이 움직인다. 두 트리를 따로 렌더해 태그·클래스(입력은 style 도)로 비교한다(실제 크기는 브라우저 실측의 몫).
 * 검색줄도 접지 않고 그대로 비교한다 — fallback 은 같은 클래스의 읽기 전용 입력·핸들러 없는 버튼이라 태그·클래스가 같다.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/faq',
  useSelectedLayoutSegment: () => null,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { FaqPageFallback } from '@/app/faq/_components/FaqPageFallback';
import { DEFAULT_FAQ_LIST_PARAMS } from '@/app/faq/_lib/faqParams';
import { FaqPage } from '@/app/faq/_pages/FaqPage';

import { faqCategories, faqListPage } from './faq-page-fallback-fixture';

const BASE = 'http://localhost:8080/api/v1';
// 마운트 요청 — 시드가 stale(updatedAt 0)이라 목록·카테고리를 다시 받는다. 같은 데이터를 돌려준다.
const server = setupServer(
  http.get(`${BASE}/federation/faqs`, () => HttpResponse.json({ ok: true, data: faqListPage, message: null })),
  http.get(`${BASE}/federation/faq-categories`, () =>
    HttpResponse.json({ ok: true, data: faqCategories, message: null }),
  ),
);
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

const indent = (depth: number, text: string) => `${'  '.repeat(depth)}${text}`;

// 클래스는 문자열 그대로 비교한다(공용 상수의 cn 결과까지 같아야 한다). 입력은 style 속성(fontFamily)도 높이에 영향을 준다.
const describeElement = (element: Element) => {
  const description = `${element.tagName.toLowerCase()} "${element.getAttribute('class') ?? ''}"`;
  return element.tagName === 'INPUT' ? `${description} style="${element.getAttribute('style') ?? ''}"` : description;
};

function outlineSubtree(element: Element, depth: number): string[] {
  return [
    indent(depth, describeElement(element)),
    ...Array.from(element.children).flatMap((child) => outlineSubtree(child, depth + 1)),
  ];
}

/**
 * 첫 행 자리를 정하는 것을 문서 순서대로 펼친다 — 페이지 루트에서 첫 행 버튼(첫 질문을 담은 button[aria-controls])까지의 조상(▸)과,
 * 각 조상 앞에 놓인 형제(행 위 줄)의 하위 트리. 실제 화면을 감싼 Provider 들은 DOM 을 앞에 남기지 않아 페이지 루트가 곧
 * 렌더 컨테이너의 첫 자식이다.
 */
function outlineAboveFirstRow(container: HTMLElement): string[] {
  const pageRoot = container.firstElementChild;
  if (pageRoot === null) throw new Error('페이지 루트가 없다');
  const firstQuestion = faqListPage.content[0]?.question ?? '';
  const firstRowButton =
    Array.from(pageRoot.querySelectorAll('button[aria-controls]')).find((button) =>
      button.textContent?.includes(firstQuestion),
    ) ?? null;
  if (firstQuestion === '' || firstRowButton === null) {
    throw new Error(`${describeElement(pageRoot)} 에 첫 질문(${firstQuestion})을 담은 행 버튼이 없다`);
  }
  const ancestors: Element[] = [];
  for (let node: Element | null = firstRowButton; node !== null && node !== pageRoot; node = node.parentElement) {
    ancestors.unshift(node);
  }
  return [
    indent(0, `▸ ${describeElement(pageRoot)}`),
    ...ancestors.flatMap((ancestor, index) => {
      const siblings = Array.from(ancestor.parentElement?.children ?? []);
      return [
        ...siblings.slice(0, siblings.indexOf(ancestor)).flatMap((row) => outlineSubtree(row, index + 1)),
        indent(index + 1, `▸ ${describeElement(ancestor)}`),
      ];
    }),
  ];
}

/** 실제 화면 — 서버가 시드한 첫 진입 키(목록·카테고리)를 들고 쿼리 없이 마운트한다. 펼침은 교체 순간(첫 커밋)의 화면이다. */
async function outlineSeededPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(federationFaqQueryKeys.list(DEFAULT_FAQ_LIST_PARAMS), faqListPage, { updatedAt: 0 });
  queryClient.setQueryData(federationFaqQueryKeys.categories, faqCategories, { updatedAt: 0 });
  // 피드백 위젯(useToast·useSubmitFaqFeedbackMutation) 때문에 Toast·Query·ApiClient 프로바이더가 필요하다.
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>
          <FaqPage />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  const outline = outlineAboveFirstRow(container);
  // 마운트 요청이 테스트 밖으로 새지 않게 응답까지 받고 끝낸다.
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  return outline;
}

const outlineFallback = () =>
  outlineAboveFirstRow(render(<FaqPageFallback page={faqListPage} categories={faqCategories} />).container);

describe('FaqPageFallback ↔ 실제 화면(시드 마운트) — 첫 행 자리', () => {
  it('첫 행까지의 조상과 그 위 줄(InfoTabs·제목 블록·검색줄·칩 줄)이 태그·클래스까지 같다', async () => {
    const seededPage = await outlineSeededPage();

    expect(seededPage).toEqual(outlineFallback());
  });
});
