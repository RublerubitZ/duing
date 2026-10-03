import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoticeDetail } from '@duing/types';

const { fetchPublicNoticeDetailMock } = vi.hoisted(() => ({ fetchPublicNoticeDetailMock: vi.fn() }));

vi.mock('@/app/_lib/public-content', () => ({ fetchPublicNoticeDetail: fetchPublicNoticeDetailMock }));

// 클라이언트 트리 대신 캐시에 심긴 상세(제목·dataUpdatedAt)를 그대로 보여 주는 탐침.
vi.mock('@/app/notices/[noticeId]/_pages/NoticeDetailPage', async () => {
  const { createElement } = await import('react');
  const { useQueryClient } = await import('@tanstack/react-query');
  return {
    NoticeDetailPage: function NoticeDetailPageProbe() {
      const state = useQueryClient().getQueryState<{ title: string }>(['notices', 'detail', 42]);
      return createElement(
        'p',
        { 'data-testid': 'probe' },
        state?.data ? `${state.data.title}|${state.dataUpdatedAt}` : 'no-seed',
      );
    },
  };
});

import NoticeDetailRoute, { generateMetadata, revalidate } from '@/app/notices/[noticeId]/page';

function notice(overrides: Partial<NoticeDetail> = {}): NoticeDetail {
  return {
    id: 42,
    title: '가을 동아리 박람회 안내',
    summary: '박람회 일정과 부스 배치를 안내해요',
    content: '<p>본문</p>',
    contentFormat: 'HTML',
    ...overrides,
  } as NoticeDetail;
}

function params(noticeId: string) {
  return { params: Promise.resolve({ noticeId }) };
}

async function renderRoute(noticeId: string, queryClient = new QueryClient()) {
  const element = await NoticeDetailRoute(params(noticeId));
  render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  return screen.getByTestId('probe').textContent;
}

beforeEach(() => {
  fetchPublicNoticeDetailMock.mockReset();
});

describe('소식 상세 라우트 — 24시간 ISR', () => {
  it('재생성 주기는 24시간', () => {
    expect(revalidate).toBe(86400);
  });

  it('공개 소식은 상세를 dataUpdatedAt 0 으로 시드한다 — 마운트 때 항상 재요청', async () => {
    fetchPublicNoticeDetailMock.mockResolvedValue({ status: 'found', data: notice() });

    await expect(renderRoute('42')).resolves.toBe('가을 동아리 박람회 안내|0');
    expect(fetchPublicNoticeDetailMock).toHaveBeenCalledWith(42);
  });

  // HydrationBoundary 는 기존 키를 렌더 뒤 이펙트에서 덮으므로 렌더 중 탐침만으로는 못 잡는다 — 이펙트 뒤 캐시까지 본다.
  it('캐시에 이미 있는 상세는 덮어쓰지 않는다', async () => {
    fetchPublicNoticeDetailMock.mockResolvedValue({ status: 'found', data: notice({ title: '옛 제목' }) });
    const queryClient = new QueryClient();
    // 기존 항목은 1분 전 시각 — 시드와 같은 ms 면 hydrate 가 덮지 않아 '지금' 찍힌 시드 회귀를 놓친다.
    queryClient.setQueryData(['notices', 'detail', 42], notice({ title: '최신 제목' }), {
      updatedAt: Date.now() - 60_000,
    });

    await expect(renderRoute('42', queryClient)).resolves.toMatch(/^최신 제목\|/);
    expect(queryClient.getQueryData<NoticeDetail>(['notices', 'detail', 42])?.title).toBe('최신 제목');
  });

  it.each(['notFound', 'unavailable'] as const)('%s 면 시드 없이 지금 셸을 그린다', async (status) => {
    fetchPublicNoticeDetailMock.mockResolvedValue({ status });

    await expect(renderRoute('42')).resolves.toBe('no-seed');
  });

  it('형식이 틀린 id 는 조회하지 않는다', async () => {
    await expect(renderRoute('042')).resolves.toBe('no-seed');
    expect(fetchPublicNoticeDetailMock).not.toHaveBeenCalled();
  });
});

describe('소식 상세 메타데이터', () => {
  it('공개 소식은 제목·설명(요약)·canonical 을 낸다', async () => {
    fetchPublicNoticeDetailMock.mockResolvedValue({ status: 'found', data: notice() });

    await expect(generateMetadata(params('42'))).resolves.toEqual({
      title: '가을 동아리 박람회 안내 | 두잉',
      description: '박람회 일정과 부스 배치를 안내해요',
      alternates: { canonical: '/notices/42' },
    });
  });

  it('요약이 비면 HTML 본문 텍스트를 쓴다', async () => {
    fetchPublicNoticeDetailMock.mockResolvedValue({
      status: 'found',
      data: notice({ summary: '  ', content: '<p>부스 <strong>신청</strong> 안내</p>' }),
    });

    const metadata = await generateMetadata(params('42'));
    expect(metadata.description).toBe('부스 신청 안내');
  });

  it('요약이 비고 MARKDOWN 이면 본문 원문을 쓴다', async () => {
    fetchPublicNoticeDetailMock.mockResolvedValue({
      status: 'found',
      data: notice({ summary: '', content: '마크다운 본문', contentFormat: 'MARKDOWN' }),
    });

    const metadata = await generateMetadata(params('42'));
    expect(metadata.description).toBe('마크다운 본문');
  });

  it('요약·본문이 모두 비면(빈 문단) 제목으로 만든다', async () => {
    fetchPublicNoticeDetailMock.mockResolvedValue({
      status: 'found',
      data: notice({ summary: '', content: '<p></p>' }),
    });

    const metadata = await generateMetadata(params('42'));
    expect(metadata.description).toBe('가을 동아리 박람회 안내 — 두잉 소식');
  });

  it('없거나 동아리 공지면 noindex', async () => {
    fetchPublicNoticeDetailMock.mockResolvedValue({ status: 'notFound' });

    await expect(generateMetadata(params('42'))).resolves.toEqual({ robots: { index: false, follow: true } });
  });

  it('빌드 국면 장애면 루트 기본값을 쓴다', async () => {
    fetchPublicNoticeDetailMock.mockResolvedValue({ status: 'unavailable' });

    await expect(generateMetadata(params('42'))).resolves.toEqual({});
  });
});
