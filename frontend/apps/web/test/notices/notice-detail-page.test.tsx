import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoticeDetail, NoticeContentFormat } from '@duing/types';

vi.mock('../../app/_components/ExploreNav', () => ({
  ExploreNav: () => <nav aria-label="탐색 네비게이션" />,
}));

vi.mock('../../app/notices/_components/NoticeMarkdown', () => ({
  NoticeMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const mockUseNoticeDetailQuery = vi.fn();
const mockUseNoticeListQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useNoticeDetailQuery: (...args: unknown[]) => mockUseNoticeDetailQuery(...args),
  useNoticeListQuery: (...args: unknown[]) => mockUseNoticeListQuery(...args),
}));

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ noticeId: '42' }),
  useRouter: () => ({ replace: mockRouterReplace, back: vi.fn(), push: vi.fn() }),
}));

import NoticeDetailPage from '../../app/notices/[noticeId]/page';

const DEFAULT_CONTENT_FORMAT: NoticeContentFormat = 'MARKDOWN';

function makeDetail(overrides: Partial<NoticeDetail> = {}): NoticeDetail {
  return {
    id: 42,
    title: '공지 제목',
    summary: '공지 요약',
    content: '## 본문 내용\n\n상세 텍스트',
    contentFormat: DEFAULT_CONTENT_FORMAT,
    coverImageUrl: 'https://example.com/cover.jpg',
    linkUrl: null,
    category: 'GENERAL',
    tags: [],
    visibility: null,
    clubScopeRole: null,
    targetClubIds: null,
    notifyOnPublish: false,
    pinned: false,
    expiresAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    bodyImageUrls: [],
    eventInfo: null,
    ...overrides,
  };
}

function detailSuccess(detail: NoticeDetail) {
  return { data: detail, isLoading: false, isSuccess: true, isError: false, error: null };
}

function listSuccess(content: unknown[] = []) {
  return { data: { content, totalPages: 1, totalElements: content.length }, isLoading: false, isSuccess: true, isError: false, error: null };
}

describe('NoticeDetailPage (재설계)', () => {
  it('제목과 리드(summary)가 렌더링된다', () => {
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ title: '봄 축제 공지', summary: '봄 축제 일정 안내' })));
    mockUseNoticeListQuery.mockReturnValue(listSuccess());

    render(<NoticeDetailPage />);

    expect(screen.getByRole('heading', { level: 1, name: /봄 축제 공지/ })).toBeInTheDocument();
    expect(screen.getByText('봄 축제 일정 안내')).toBeInTheDocument();
  });

  it('eventInfo 가 있으면 "한눈에 보기" 카드가, 없으면 "공지 정보" 카드가 보인다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());

    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({
      eventInfo: { startAt: '2026-09-25T10:00:00', endAt: '2026-09-27T18:00:00', location: '중앙광장', host: '학생자치회', audience: '재학생' },
    })));
    const withEvent = render(<NoticeDetailPage />);
    expect(screen.getByText('한눈에 보기')).toBeInTheDocument();
    expect(screen.getByText('중앙광장')).toBeInTheDocument();
    withEvent.unmount();

    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ eventInfo: null })));
    render(<NoticeDetailPage />);
    expect(screen.getByText('공지 정보')).toBeInTheDocument();
  });

  it('bodyImageUrls 가 있으면 "사진" 섹션과 이미지가 렌더링된다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({
      bodyImageUrls: ['https://example.com/b1.png'],
    })));

    render(<NoticeDetailPage />);

    expect(screen.getByText('사진')).toBeInTheDocument();
    expect(screen.getByAltText('본문 이미지 1')).toBeInTheDocument();
  });

  it('linkUrl 이 있으면 "원문 보기" 링크가 노출된다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ linkUrl: 'https://example.com' })));

    render(<NoticeDetailPage />);

    const link = screen.getByRole('link', { name: /원문 보기/ });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('관련 공지가 있으면 같은 카테고리 다른 공지가 노출된다', () => {
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ id: 42, category: 'FAIR' })));
    mockUseNoticeListQuery.mockReturnValue(listSuccess([
      { id: 42, title: '자기 자신', category: 'FAIR', createdAt: '2026-05-02T00:00:00Z', summary: '', coverImageUrl: '', linkUrl: null, tags: [], pinned: false, expiresAt: null },
      { id: 99, title: '다른 박람회 공지', category: 'FAIR', createdAt: '2026-05-03T00:00:00Z', summary: '', coverImageUrl: '', linkUrl: null, tags: [], pinned: false, expiresAt: null },
    ]));

    render(<NoticeDetailPage />);

    expect(screen.getByText('다른 박람회 공지')).toBeInTheDocument();
    expect(screen.queryByText('자기 자신')).not.toBeInTheDocument();
  });

  it('expiresAt 이 과거이면 "마감된 공지" 배너가 보인다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ expiresAt: pastDate })));

    render(<NoticeDetailPage />);

    expect(screen.getByText(/마감된 공지/)).toBeInTheDocument();
  });

  it('403 에러이면 router.replace("/notices") 가 호출된다', async () => {
    mockRouterReplace.mockReset();
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false, isError: true, error: { status: 403 } });

    render(<NoticeDetailPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/notices');
    });
  });
});
