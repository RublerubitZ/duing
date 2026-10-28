/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 탐침이 시드를 읽은 결과를 남기는 곳 — 전역 없이 모킹 팩토리와 테스트가 함께 본다.
const { fetchPublicFaqListMock, fetchPublicFaqCategoriesMock, seedProbe } = vi.hoisted(() => {
  const probe: { list: string | undefined; categories: string | undefined } = {
    list: undefined,
    categories: undefined,
  };
  return { fetchPublicFaqListMock: vi.fn(), fetchPublicFaqCategoriesMock: vi.fn(), seedProbe: probe };
});

vi.mock('@/app/_lib/public-content', () => ({
  fetchPublicFaqList: fetchPublicFaqListMock,
  fetchPublicFaqCategories: fetchPublicFaqCategoriesMock,
}));

// 정적 프리렌더에서 useSearchParams 가 일으키는 CSR bailout 을 흉내 낸다 — 본문이 throw 하면 Suspense 가 fallback 을
// 그린다. 탐침은 throw 전에 화면 키로 시드를 읽어 seedProbe 에 남긴다(서버 키 = 화면 키 검증).
vi.mock('@/app/faq/_pages/FaqPage', async () => {
  const { useQueryClient } = await import('@tanstack/react-query');
  const { federationFaqQueryKeys } = await import('@duing/hooks');
  const { DEFAULT_FAQ_PARAMS, toFaqListParams } = await import('@/app/faq/_lib/faqParams');
  return {
    FaqPage: function FaqPageProbe() {
      const queryClient = useQueryClient();
      const seededList = queryClient.getQueryState<{ totalElements: number }>(
        federationFaqQueryKeys.list(toFaqListParams(DEFAULT_FAQ_PARAMS)),
      );
      const seededCategories = queryClient.getQueryState<unknown[]>(federationFaqQueryKeys.categories);
      seedProbe.list = seededList?.data ? `${seededList.data.totalElements}|${seededList.dataUpdatedAt}` : 'no-seed';
      seedProbe.categories = seededCategories?.data
        ? `${seededCategories.data.length}|${seededCategories.dataUpdatedAt}`
        : 'no-seed';
      throw new Error('CSR bailout 흉내');
    },
  };
});

// fallback 트리(InfoTabs·HomeFooter)가 부른다 — Task 3 서버 렌더 테스트와 같은 모킹. 탐침은 useSearchParams 를 부르지 않는다.
vi.mock('next/navigation', () => ({
  usePathname: () => '/faq',
  useSelectedLayoutSegment: () => null,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  // fallback 트리가 부르면 정적 렌더가 faq/loading.tsx 경계까지 클라이언트 렌더로 넘어가 HTML 이 로딩 화면이 된다.
  useSearchParams: () => {
    throw new Error('FAQ 서버 기본 목록 트리에서 useSearchParams 금지 — ISR HTML 이 로딩 화면으로 바뀐다(CSR bailout)');
  },
}));

import { DEFAULT_FAQ_LIST_PARAMS } from '@/app/faq/_lib/faqParams';
import { FAQ_CHIP_CLASS } from '@/app/faq/_lib/faqUi';
import FaqRoute, { metadata, revalidate } from '@/app/faq/page';

import { faqCategories, faqListPage } from './faq-page-fallback-fixture';

// 칩은 공용 클래스로 센다 — 행의 카테고리 캡션과 같은 이름이 섞이지 않게.
const countChips = (html: string, selected: boolean) => html.split(`class="${FAQ_CHIP_CLASS(selected)}"`).length - 1;

async function renderRouteHtml() {
  const element = await FaqRoute();
  return renderToString(<QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>);
}

beforeEach(() => {
  fetchPublicFaqListMock.mockReset();
  fetchPublicFaqCategoriesMock.mockReset();
  seedProbe.list = undefined;
  seedProbe.categories = undefined;
});

describe('자주 묻는 질문 라우트 — 24시간 ISR', () => {
  it('재생성 주기는 24시간', () => {
    expect(revalidate).toBe(86400);
  });

  it('쿼리 없는 첫 진입 키로 목록과 카테고리를 함께 조회한다', async () => {
    fetchPublicFaqListMock.mockResolvedValue({ status: 'found', data: faqListPage });
    fetchPublicFaqCategoriesMock.mockResolvedValue({ status: 'found', data: faqCategories });

    await renderRouteHtml();

    expect(fetchPublicFaqListMock).toHaveBeenCalledTimes(1);
    expect(fetchPublicFaqListMock).toHaveBeenCalledWith(DEFAULT_FAQ_LIST_PARAMS);
    expect(fetchPublicFaqCategoriesMock).toHaveBeenCalledTimes(1);
    expect(fetchPublicFaqCategoriesMock).toHaveBeenCalledWith();
  });

  it('목록·카테고리를 화면 키로 시드하고(updatedAt 0), 서버 HTML 에 질문·답변·빈 카테고리 칩을 담는다', async () => {
    fetchPublicFaqListMock.mockResolvedValue({ status: 'found', data: faqListPage });
    fetchPublicFaqCategoriesMock.mockResolvedValue({ status: 'found', data: faqCategories });

    const html = await renderRouteHtml();

    expect(seedProbe.list).toBe(`${faqListPage.totalElements}|0`);
    expect(seedProbe.categories).toBe(`${faqCategories.length}|0`);
    expect(html).toContain('두잉은 어떤 서비스인가요?');
    expect(html).toContain('대구대학교 동아리를 둘러보고 지원부터 운영까지 한곳에서 하는 통합 플랫폼이에요.');
    // 질문이 하나도 없는 카테고리도 칩으로 그린다 — 행 캡션에는 나오지 않는 이름이다.
    expect(html).toContain('>기타</button>');
    expect(html).toContain('>지원사업·예산</button>');
    expect(countChips(html, false)).toBe(faqCategories.length);
  });

  it('found 라도 목록이 비면 시드 없이 지금 로딩 화면을 그린다 — 복구 중 같은 순간의 빈 200 을 24시간 굳히지 않는다', async () => {
    fetchPublicFaqListMock.mockResolvedValue({
      status: 'found',
      data: { ...faqListPage, content: [], totalElements: 0, totalPages: 0, hasNext: false },
    });
    fetchPublicFaqCategoriesMock.mockResolvedValue({ status: 'found', data: faqCategories });

    const html = await renderRouteHtml();

    expect(seedProbe.list).toBe('no-seed');
    // 목록이 없으면 카테고리도 시드하지 않는다 — 화면이 스켈레톤부터 시작하는 지금 동작 그대로.
    expect(seedProbe.categories).toBe('no-seed');
    expect(html).toContain('aria-label="페이지 불러오는 중"');
    expect(html).not.toContain('>기타</button>');
  });

  it('목록이 unavailable(빌드 국면 장애)이면 시드 없이 지금 로딩 화면을 그린다', async () => {
    fetchPublicFaqListMock.mockResolvedValue({ status: 'unavailable' });
    fetchPublicFaqCategoriesMock.mockResolvedValue({ status: 'found', data: faqCategories });

    const html = await renderRouteHtml();

    expect(seedProbe.list).toBe('no-seed');
    expect(seedProbe.categories).toBe('no-seed');
    expect(html).toContain('aria-label="페이지 불러오는 중"');
    expect(html).not.toContain('>기타</button>');
  });

  it('카테고리만 unavailable(빌드 국면 장애)이면 목록만 시드하고 칩은 "전체"만 그린다', async () => {
    fetchPublicFaqListMock.mockResolvedValue({ status: 'found', data: faqListPage });
    fetchPublicFaqCategoriesMock.mockResolvedValue({ status: 'unavailable' });

    const html = await renderRouteHtml();

    expect(seedProbe.list).toBe(`${faqListPage.totalElements}|0`);
    expect(seedProbe.categories).toBe('no-seed');
    expect(html).toContain('두잉은 어떤 서비스인가요?');
    expect(countChips(html, true)).toBe(1);
    expect(countChips(html, false)).toBe(0);
    expect(html).toContain('>전체</button>');
  });

  it('제목·설명·canonical 은 그대로', () => {
    expect(metadata).toEqual({
      title: '자주 묻는 질문 | 두잉',
      description: '총동아리연합회에 자주 묻는 질문과 답변을 확인하세요.',
      alternates: { canonical: '/faq' },
    });
  });
});
