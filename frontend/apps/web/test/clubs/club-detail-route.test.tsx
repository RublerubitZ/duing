import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubDetail } from '@duing/types';

const { fetchPublicClubDetailMock } = vi.hoisted(() => ({ fetchPublicClubDetailMock: vi.fn() }));

vi.mock('@/app/_lib/public-content', () => ({ fetchPublicClubDetail: fetchPublicClubDetailMock }));

// 클라이언트 트리 대신 캐시에 심긴 상세(이름·dataUpdatedAt)를 그대로 보여 주는 탐침.
vi.mock('@/app/clubs/[clubId]/_pages/ClubDetailPage', async () => {
  const { createElement } = await import('react');
  const { useQueryClient } = await import('@tanstack/react-query');
  return {
    ClubDetailPage: function ClubDetailPageProbe({ clubId }: { clubId: number }) {
      const state = useQueryClient().getQueryState<{ name: string }>(['clubs', clubId]);
      return createElement(
        'p',
        { 'data-testid': 'probe' },
        state?.data ? `${state.data.name}|${state.dataUpdatedAt}` : 'no-seed',
      );
    },
  };
});

import ClubDetailRoute, { generateMetadata, revalidate } from '@/app/clubs/[clubId]/page';

function club(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return { id: 4, name: '비호상록회', tagline: '지역사회와 함께하는 따뜻한 봉사동아리', description: null, ...overrides } as ClubDetail;
}

function params(clubId: string) {
  return { params: Promise.resolve({ clubId }) };
}

async function renderRoute(clubId: string, queryClient = new QueryClient()) {
  const element = await ClubDetailRoute(params(clubId));
  render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  return screen.getByTestId('probe').textContent;
}

beforeEach(() => {
  fetchPublicClubDetailMock.mockReset();
});

describe('동아리 상세 라우트 — 24시간 ISR', () => {
  it('재생성 주기는 24시간', () => {
    expect(revalidate).toBe(86400);
  });

  it('공개 동아리는 상세를 dataUpdatedAt 0 으로 시드한다 — 마운트 때 항상 재요청', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club() });

    await expect(renderRoute('4')).resolves.toBe('비호상록회|0');
    expect(fetchPublicClubDetailMock).toHaveBeenCalledWith(4);
  });

  it('캐시에 이미 있는 상세는 덮어쓰지 않는다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club({ name: '옛 이름' }) });
    const queryClient = new QueryClient();
    queryClient.setQueryData(['clubs', 4], club({ name: '최신 이름' }));

    await expect(renderRoute('4', queryClient)).resolves.toMatch(/^최신 이름\|/);
  });

  it.each(['notFound', 'unavailable'] as const)('%s 면 시드 없이 지금 셸을 그린다', async (status) => {
    fetchPublicClubDetailMock.mockResolvedValue({ status });

    await expect(renderRoute('4')).resolves.toBe('no-seed');
  });

  it('형식이 틀린 id 는 조회하지 않는다', async () => {
    await expect(renderRoute('042')).resolves.toBe('no-seed');
    expect(fetchPublicClubDetailMock).not.toHaveBeenCalled();
  });
});

describe('동아리 상세 메타데이터', () => {
  it('공개 동아리는 제목·설명(한줄소개)·canonical 을 낸다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club() });

    await expect(generateMetadata(params('4'))).resolves.toEqual({
      title: '비호상록회 | 두잉',
      description: '지역사회와 함께하는 따뜻한 봉사동아리',
      alternates: { canonical: '/clubs/4' },
    });
  });

  it('한줄소개가 없으면 소개 텍스트 앞 150자를 쓴다', async () => {
    const longDescription = `<p>${'가'.repeat(200)}</p>`;
    fetchPublicClubDetailMock.mockResolvedValue({
      status: 'found',
      data: club({ tagline: null, description: longDescription }),
    });

    const metadata = await generateMetadata(params('4'));
    expect(metadata.description).toBe(`${'가'.repeat(149)}…`);
  });

  it('한줄소개·소개가 모두 없으면 이름으로 만든다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club({ tagline: null, description: null }) });

    const metadata = await generateMetadata(params('4'));
    expect(metadata.description).toBe('비호상록회 — 대구대학교 동아리');
  });

  it('없거나 비공개면 noindex', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'notFound' });

    await expect(generateMetadata(params('4'))).resolves.toEqual({ robots: { index: false, follow: true } });
  });

  it('빌드 국면 장애면 루트 기본값을 쓴다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'unavailable' });

    await expect(generateMetadata(params('4'))).resolves.toEqual({});
  });
});
