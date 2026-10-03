/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 탐침이 시드를 읽은 결과를 남기는 곳 — 전역 없이 모킹 팩토리와 테스트가 함께 본다.
const { fetchPublicClubListMock, seedProbe } = vi.hoisted(() => {
  const probe: { value: string | undefined } = { value: undefined };
  return { fetchPublicClubListMock: vi.fn(), seedProbe: probe };
});

vi.mock('@/app/_lib/public-content', () => ({ fetchPublicClubList: fetchPublicClubListMock }));

// 정적 프리렌더에서 useSearchParams 가 일으키는 CSR bailout 을 흉내 낸다 — 본문이 throw 하면 Suspense 가 fallback 을
// 그린다. 탐침은 throw 전에 화면 키로 시드를 읽어 seedProbe 에 남긴다(서버 키 = 화면 키 검증).
vi.mock('@/app/clubs/_pages/ClubExplorePage', async () => {
  const { useQueryClient } = await import('@tanstack/react-query');
  const { clubQueryKeys } = await import('@duing/hooks');
  const { DEFAULT_EXPLORE_PARAMS, EXPLORE_PAGE_SIZE, toApiParams } = await import('@/app/clubs/_lib/exploreParams');
  return {
    ClubExplorePage: function ClubExplorePageProbe() {
      const seeded = useQueryClient().getQueryState<{ totalElements: number }>(
        clubQueryKeys.list(toApiParams(DEFAULT_EXPLORE_PARAMS, EXPLORE_PAGE_SIZE)),
      );
      seedProbe.value = seeded?.data ? `${seeded.data.totalElements}|${seeded.dataUpdatedAt}` : 'no-seed';
      throw new Error('CSR bailout 흉내');
    },
  };
});

import { DEFAULT_CLUB_LIST_PARAMS } from '@/app/clubs/_lib/exploreParams';
import ClubsRoute, { metadata, revalidate } from '@/app/clubs/page';

import { clubListPage } from './club-explore-fallback-fixture';

async function renderRouteHtml() {
  const element = await ClubsRoute();
  return renderToString(<QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>);
}

beforeEach(() => {
  fetchPublicClubListMock.mockReset();
  seedProbe.value = undefined;
});

describe('동아리 탐색 라우트 — 1시간 ISR', () => {
  it('재생성 주기는 1시간 — 추천순이 매시간 바뀐다', () => {
    expect(revalidate).toBe(3600);
  });

  it('쿼리 없는 첫 진입 키로 조회해 시드하고, 서버 HTML 에는 기본 목록을 담는다', async () => {
    fetchPublicClubListMock.mockResolvedValue({ status: 'found', data: clubListPage });

    const html = await renderRouteHtml();

    expect(fetchPublicClubListMock).toHaveBeenCalledWith(DEFAULT_CLUB_LIST_PARAMS);
    expect(seedProbe.value).toBe('166|0');
    expect(html).toContain('모션케어');
    expect(html).toContain('href="/clubs/1"');
  });

  it.each(['notFound', 'unavailable'] as const)('%s 면 시드 없이 지금 스켈레톤을 그린다', async (status) => {
    fetchPublicClubListMock.mockResolvedValue({ status });

    const html = await renderRouteHtml();

    expect(seedProbe.value).toBe('no-seed');
    expect(html).toContain('동아리 목록 불러오는 중');
  });

  it('found 라도 목록이 비면 시드 없이 지금 스켈레톤을 그린다 — 복구 중 같은 순간의 빈 200 을 1시간 굳히지 않는다', async () => {
    fetchPublicClubListMock.mockResolvedValue({
      status: 'found',
      data: { ...clubListPage, content: [], totalElements: 0, totalPages: 0, hasNext: false },
    });

    const html = await renderRouteHtml();

    expect(seedProbe.value).toBe('no-seed');
    expect(html).toContain('동아리 목록 불러오는 중');
  });

  it('제목은 그대로, canonical 은 쿼리 없는 /clubs', () => {
    expect(metadata).toEqual({ title: '동아리 탐색 | 두잉', alternates: { canonical: '/clubs' } });
  });
});
