import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoticeCardItem, PageResponse } from '@duing/types';

const { fetchPublicNoticeListMock } = vi.hoisted(() => ({ fetchPublicNoticeListMock: vi.fn() }));

vi.mock('@/app/_lib/public-content', () => ({ fetchPublicNoticeList: fetchPublicNoticeListMock }));

// 화면이 실제로 만드는 키(category·keyword 가 undefined 인 첫 진입 조건)로 캐시를 읽는 탐침 —
// 서버 키와 화면 키가 어긋나면 시드가 버려져 스켈레톤이 다시 보인다.
vi.mock('@/app/notices/_pages/NoticePage', async () => {
  const { createElement } = await import('react');
  const { useQueryClient } = await import('@tanstack/react-query');
  const { noticeQueryKeys } = await import('@duing/hooks');
  return {
    NoticePage: function NoticePageProbe() {
      const state = useQueryClient().getQueryState<{ totalElements: number }>(
        noticeQueryKeys.list({ source: 'SCHOOL', category: undefined, keyword: undefined, page: 0, size: 20 }),
      );
      return createElement(
        'p',
        { 'data-testid': 'probe' },
        state?.data ? `${state.data.totalElements}|${state.dataUpdatedAt}` : 'no-seed',
      );
    },
  };
});

import NoticesRoute, { metadata, revalidate } from '@/app/notices/page';

import { noticeListPage } from './notice-list-tree-fixture';

const emptyListPage: PageResponse<NoticeCardItem> = {
  content: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
  hasNext: false,
};

async function renderRoute() {
  const element = await NoticesRoute();
  render(<QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>);
  return screen.getByTestId('probe').textContent;
}

beforeEach(() => {
  fetchPublicNoticeListMock.mockReset();
});

describe('소식 목록 라우트 — 24시간 ISR', () => {
  it('재생성 주기는 24시간', () => {
    expect(revalidate).toBe(86400);
  });

  it('첫 진입 키(학교 공지·첫 페이지·20건)로 조회해 dataUpdatedAt 0 으로 시드한다', async () => {
    fetchPublicNoticeListMock.mockResolvedValue({ status: 'found', data: noticeListPage });

    await expect(renderRoute()).resolves.toBe(`${noticeListPage.totalElements}|0`);
    expect(fetchPublicNoticeListMock).toHaveBeenCalledWith({ source: 'SCHOOL', page: 0, size: 20 });
  });

  it('빈 목록(found·0건)은 시드하지 않는다 — 복구 중 같은 순간의 빈 200 이 24시간 박제되지 않게', async () => {
    fetchPublicNoticeListMock.mockResolvedValue({ status: 'found', data: emptyListPage });

    await expect(renderRoute()).resolves.toBe('no-seed');
  });

  it.each(['notFound', 'unavailable'] as const)('%s 면 시드 없이 지금 셸을 그린다', async (status) => {
    fetchPublicNoticeListMock.mockResolvedValue({ status });

    await expect(renderRoute()).resolves.toBe('no-seed');
  });

  it('제목은 그대로, canonical 은 쿼리 없는 /notices', () => {
    expect(metadata).toEqual({ title: '소식 | 두잉', alternates: { canonical: '/notices' } });
  });
});
