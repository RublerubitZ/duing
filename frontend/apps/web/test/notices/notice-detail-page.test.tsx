import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoticeDetail } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('../../app/_components/ExploreNav', () => ({
  ExploreNav: () => <nav aria-label="탐색 네비게이션" />,
}));

// NoticeMarkdown 은 react-markdown 에 의존하므로 단순 <div> 로 대체
vi.mock('../../app/notices/_components/NoticeMarkdown', () => ({
  NoticeMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const mockUseNoticeDetailQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useNoticeDetailQuery: (...args: unknown[]) => mockUseNoticeDetailQuery(...args),
}));

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ noticeId: '42' }),
  useRouter: () => ({ replace: mockRouterReplace, back: vi.fn(), push: vi.fn() }),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import NoticeDetailPage from '../../app/notices/[noticeId]/page';

function makeDetail(overrides: Partial<NoticeDetail> = {}): NoticeDetail {
  return {
    id: 42,
    title: '공지 제목',
    summary: '공지 요약',
    content: '## 본문 내용\n\n상세 텍스트',
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
    ...overrides,
  };
}

function makeSuccessResponse(detail: NoticeDetail) {
  return {
    data: detail,
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('NoticeDetailPage', () => {
  it('쿼리 성공 시 제목·요약·본문이 화면에 렌더링된다', () => {
    mockUseNoticeDetailQuery.mockReturnValue(
      makeSuccessResponse(makeDetail({ title: '봄 축제 공지', summary: '봄 축제 일정 안내' })),
    );

    render(<NoticeDetailPage />);

    expect(screen.getByRole('heading', { level: 1, name: '봄 축제 공지' })).toBeInTheDocument();
    expect(screen.getByText('봄 축제 일정 안내')).toBeInTheDocument();
  });

  it('linkUrl 이 있으면 "자세히 보기 →" 앵커가 노출된다', () => {
    mockUseNoticeDetailQuery.mockReturnValue(
      makeSuccessResponse(makeDetail({ linkUrl: 'https://example.com' })),
    );

    render(<NoticeDetailPage />);

    const link = screen.getByRole('link', { name: /자세히 보기/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('expiresAt 이 과거이면 ExpiredBanner 의 "마감된 공지" 문구가 보인다', () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    mockUseNoticeDetailQuery.mockReturnValue(
      makeSuccessResponse(makeDetail({ expiresAt: pastDate })),
    );

    render(<NoticeDetailPage />);

    expect(screen.getByText(/마감된 공지/)).toBeInTheDocument();
  });

  it('403 에러이면 router.replace("/notices") 가 호출된다', async () => {
    mockRouterReplace.mockReset();
    mockUseNoticeDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: { status: 403 },
    });

    render(<NoticeDetailPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/notices');
    });
  });
});
