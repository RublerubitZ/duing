import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoticeCardItem } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// ExploreNav 는 notices/layout.tsx 소유라 페이지 렌더에 포함되지 않는다(스텁 불필요).
vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav aria-label="정보" />,
}));

// next/link 는 단순 <a> 로 대체
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUseNoticeListQuery = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => ({
  // 날짜 유틸(formatDateKst 등) 순수 함수는 실제 구현을 그대로 쓴다.
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useNoticeListQuery: (...args: unknown[]) => mockUseNoticeListQuery(...args),
}));

// 인증 상태를 제어한다 — 기본 비로그인(내 동아리 세그먼트 숨김).
const mockAuthStatus = { value: 'unauthenticated' };
vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: mockAuthStatus.value }),
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
    owningClubId: null,
    clubName: null,
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

    // 목록 시트(paper/보더/라운드)는 md 전용 — 모바일에서 통짜 흰 시트가 되면 짧은 진입 뷰포트에서
    // 상단 엣지가 하단 탭바 위에 걸쳐 "두 겹 탭바" 착시를 만든다(실기기 확인). 무접두 페인트 금지.
    const tableWrapper = document.querySelector('.md\\:bg-paper');
    expect(tableWrapper).not.toBeNull();
    expect(tableWrapper).toHaveClass('md:rounded-[14px]', 'md:border', 'md:border-line');
    expect(tableWrapper?.getAttribute('style') ?? '').toBe('');
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

  it('기본 출처는 학교 공지(source=SCHOOL)이고, 비로그인 시 "내 동아리" 세그먼트는 보이지 않는다', () => {
    mockAuthStatus.value = 'unauthenticated';
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<NoticesPage />);

    expect(mockUseNoticeListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'SCHOOL' }),
    );
    expect(screen.getByRole('button', { name: '학교 공지' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '내 동아리' })).toBeNull();
  });

  it('로그인 사용자는 "내 동아리" 세그먼트를 클릭해 source=CLUB 으로 조회한다', () => {
    mockAuthStatus.value = 'authenticated';
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<NoticesPage />);

    fireEvent.click(screen.getByRole('button', { name: '내 동아리' }));

    expect(mockUseNoticeListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'CLUB', category: undefined, page: 0 }),
    );
  });

  it('동아리 공지 카드에는 동아리명 배지가 표시된다', () => {
    mockAuthStatus.value = 'authenticated';
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([
      makeNoticeItem({ id: 9, title: 'MT 안내', owningClubId: 5, clubName: '알고리즘 동아리' }),
    ]));

    render(<NoticesPage />);

    expect(screen.getByText(/알고리즘 동아리/)).toBeInTheDocument();
  });

  // 크림 캔버스(min-h-lvh)는 notices/layout.tsx 가 소유한다 — 로딩 경계 밖에서 유지되도록
  // (레이아웃 쪽 단언은 test/info/info-section-layouts.test.tsx). 여기서는 페이지가 100vh 를
  // 되살리지 않는지만 지킨다 — 100vh 는 안드로이드 크롬에서 문서를 화면보다 길게 만들어
  // fixed 하단 탭바가 주소창 개폐를 따라 흔들린다.
  // 검색 input 은 flex 아이템이라 min-width:auto(고유 최소폭)면 시스템 큰 글꼴 기기에서
  // 줄어들지 못해 검색 버튼을 화면 밖으로 밀어낸다(가로 overflow·탭바 유동, 실기기 확인).
  it('검색 input 은 min-width 0 으로 고유 최소폭을 끈다', () => {
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<NoticesPage />);

    const searchInput = screen.getByPlaceholderText('제목 또는 내용을 검색하세요');
    expect(searchInput.style.minWidth).toBe('0px');
  });

  it('페이지 루트는 100vh 높이를 쓰지 않는다', () => {
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([]));

    const { container } = render(<NoticesPage />);
    const root = container.firstElementChild;

    expect(root).not.toBeNull();
    // h-screen·min-h-screen 은 Tailwind 에서 100vh 로 컴파일된다 — 재도입의 현실적 벡터.
    expect(root?.className ?? '').not.toMatch(/\b(h-screen|min-h-screen)\b/);
    expect(root?.getAttribute('style') ?? '').not.toContain('100vh');
  });
});
