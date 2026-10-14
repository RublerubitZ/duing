import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubDetail } from '@duing/types';

const { fetchPublicClubDetailMock, fetchPublicClubHeroActivitiesMock } = vi.hoisted(() => ({
  fetchPublicClubDetailMock: vi.fn(),
  fetchPublicClubHeroActivitiesMock: vi.fn(),
}));

vi.mock('@/app/_lib/public-content', () => ({
  fetchPublicClubDetail: fetchPublicClubDetailMock,
  fetchPublicClubHeroActivities: fetchPublicClubHeroActivitiesMock,
}));

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

function club(overrides: Partial<ClubDetail> = {}): Partial<ClubDetail> {
  return { id: 4, name: '비호상록회', tagline: '지역사회와 함께하는 따뜻한 봉사동아리', description: null, ...overrides };
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
  fetchPublicClubHeroActivitiesMock.mockReset();
  fetchPublicClubHeroActivitiesMock.mockResolvedValue(null);
});

describe('동아리 상세 라우트 — 7일 ISR', () => {
  it('재생성 주기는 7일', () => {
    expect(revalidate).toBe(604800);
  });

  it('공개 동아리는 상세를 dataUpdatedAt 0 으로 시드한다 — 마운트 때 항상 재요청', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club() });

    await expect(renderRoute('4')).resolves.toBe('비호상록회|0');
    expect(fetchPublicClubDetailMock).toHaveBeenCalledWith(4);
  });

  it('연락처(회장 휴대전화)는 시드에서 뺀다 — ISR HTML 에 번호가 재생성 주기 동안 굳지 않게', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({
      status: 'found',
      data: club({ contactPhone: '010-1234-5678', contactVisibility: 'PUBLIC' }),
    });
    const queryClient = new QueryClient();

    await renderRoute('4', queryClient);
    const seededClub = queryClient.getQueryData<ClubDetail>(['clubs', 4]);
    expect(seededClub?.name).toBe('비호상록회');
    expect(seededClub?.contactPhone).toBeNull();
  });

  // HydrationBoundary 는 기존 키를 렌더 뒤 이펙트에서 덮으므로 렌더 중 탐침만으로는 못 잡는다 — 이펙트 뒤 캐시까지 본다.
  it('캐시에 이미 있는 상세는 덮어쓰지 않는다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club({ name: '옛 이름' }) });
    const queryClient = new QueryClient();
    // 기존 항목은 1분 전 시각 — 시드와 같은 ms 면 hydrate 가 덮지 않아 '지금' 찍힌 시드 회귀를 놓친다.
    queryClient.setQueryData(['clubs', 4], club({ name: '최신 이름' }), { updatedAt: Date.now() - 60_000 });

    await expect(renderRoute('4', queryClient)).resolves.toMatch(/^최신 이름\|/);
    expect(queryClient.getQueryData<ClubDetail>(['clubs', 4])?.name).toBe('최신 이름');
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

describe('동아리 상세 라우트 — 대표 활동 시드(#1457)', () => {
  const heroActivities = [
    {
      id: 1,
      clubPhotoId: 1,
      storageKey: 'k1.jpg',
      caption: null,
      width: null,
      height: null,
      title: '정기 공연',
      description: '매 학기 무대',
      displayOrder: 1,
    },
  ];

  it('대표 활동을 dataUpdatedAt 0 으로 함께 시드한다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club() });
    fetchPublicClubHeroActivitiesMock.mockResolvedValue(heroActivities);
    const queryClient = new QueryClient();
    await renderRoute('4', queryClient);
    const heroState = queryClient.getQueryState(['clubs', 4, 'hero-activities']);
    expect(heroState?.data).toEqual(heroActivities);
    expect(heroState?.dataUpdatedAt).toBe(0);
  });

  it('대표 활동이 null(조회 실패)이면 대표 활동만 시드하지 않고 상세는 시드한다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club() });
    fetchPublicClubHeroActivitiesMock.mockResolvedValue(null);
    const queryClient = new QueryClient();
    await expect(renderRoute('4', queryClient)).resolves.toBe('비호상록회|0');
    expect(queryClient.getQueryState(['clubs', 4, 'hero-activities'])).toBeUndefined();
  });

  it.each(['notFound', 'unavailable'] as const)('상세가 %s 면 대표 활동이 와도 시드하지 않는다', async (status) => {
    fetchPublicClubDetailMock.mockResolvedValue({ status });
    fetchPublicClubHeroActivitiesMock.mockResolvedValue(heroActivities);
    const queryClient = new QueryClient();
    await renderRoute('4', queryClient);
    expect(queryClient.getQueryState(['clubs', 4, 'hero-activities'])).toBeUndefined();
  });

  it('형식이 틀린 id 면 대표 활동도 조회하지 않는다', async () => {
    await renderRoute('042');
    expect(fetchPublicClubHeroActivitiesMock).not.toHaveBeenCalled();
  });

  it('캐시에 이미 있는 대표 활동은 덮어쓰지 않는다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({ status: 'found', data: club() });
    fetchPublicClubHeroActivitiesMock.mockResolvedValue(heroActivities);
    const queryClient = new QueryClient();
    const newerActivities = [{ ...heroActivities[0]!, title: '최신 제목' }];
    queryClient.setQueryData(['clubs', 4, 'hero-activities'], newerActivities, { updatedAt: Date.now() - 60_000 });
    await renderRoute('4', queryClient);
    expect(queryClient.getQueryData(['clubs', 4, 'hero-activities'])).toEqual(newerActivities);
  });

  it('상세와 대표 활동을 병렬로 조회한다 — 대표 활동 조회가 상세 응답을 기다리지 않는다', async () => {
    let resolveDetail: (value: unknown) => void = () => {};
    fetchPublicClubDetailMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    fetchPublicClubHeroActivitiesMock.mockResolvedValue(heroActivities);
    const pending = ClubDetailRoute(params('4'));
    await Promise.resolve();
    expect(fetchPublicClubHeroActivitiesMock).toHaveBeenCalledWith(4);
    resolveDetail({ status: 'found', data: club() });
    await pending;
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

  it('소개를 자를 때 이모지를 반으로 가르지 않는다', async () => {
    fetchPublicClubDetailMock.mockResolvedValue({
      status: 'found',
      data: club({ tagline: null, description: `${'가'.repeat(148)}😀😀😀` }),
    });

    const metadata = await generateMetadata(params('4'));
    expect(metadata.description).toBe(`${'가'.repeat(148)}😀…`);
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
