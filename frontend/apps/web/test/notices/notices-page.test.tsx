import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoticeCardItem } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// ExploreNav 는 usePathname 을 사용하므로 간단히 교체
vi.mock('../../app/_components/ExploreNav', () => ({
  ExploreNav: () => <nav aria-label="탐색 네비게이션" />,
}));

// next/link 는 단순 <a> 로 대체
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUseNoticeListQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useNoticeListQuery: (...args: unknown[]) => mockUseNoticeListQuery(...args),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import NoticesPage from '../../app/notices/page';

function makeNoticeItem(overrides: Partial<NoticeCardItem> = {}): NoticeCardItem {
  return {
    id: 1,
    title: '테스트 공지',
    summary: '요약 내용',
    coverImageUrl: 'https://example.com/image.jpg',
    linkUrl: null,
    category: 'GENERAL',
    tags: [],
    pinned: false,
    expiresAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makeListResponse(items: NoticeCardItem[]) {
  return {
    data: { content: items, totalPages: Math.ceil(items.length / 12), totalElements: items.length },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('NoticesPage', () => {
  it('결과가 없으면 NoticeEmptyState 의 "아직 공지가 없습니다" 문구가 보인다', () => {
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<NoticesPage />);

    expect(screen.getByText('아직 공지가 없습니다')).toBeInTheDocument();
  });

  it('공지가 2개면 두 제목이 모두 DOM 에 노출된다', () => {
    const items = [
      makeNoticeItem({ id: 1, title: '첫 번째 공지' }),
      makeNoticeItem({ id: 2, title: '두 번째 공지' }),
    ];
    mockUseNoticeListQuery.mockReturnValue(makeListResponse(items));

    render(<NoticesPage />);

    expect(screen.getByText('첫 번째 공지')).toBeInTheDocument();
    expect(screen.getByText('두 번째 공지')).toBeInTheDocument();
  });

  it('카테고리 버튼 클릭 시 category=FESTIVAL, page=0 으로 훅이 호출된다', () => {
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<NoticesPage />);

    // 초기 호출 확인 — category 는 undefined (ALL), page=0
    expect(mockUseNoticeListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ category: undefined, page: 0 }),
    );

    // "축제" 버튼 클릭
    fireEvent.click(screen.getByRole('button', { name: '축제' }));

    expect(mockUseNoticeListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'FESTIVAL', page: 0 }),
    );
  });
});
