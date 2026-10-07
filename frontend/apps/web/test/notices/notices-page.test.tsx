import { render, screen, fireEvent, within } from '@testing-library/react';
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
// selectIsAuthenticated 등 나머지 export 는 실제 모듈을 그대로 쓴다(술어 계약이 어긋나지 않게).
// 공지 페이지는 useSeededAuthStatus 로 스토어를 직접 구독한다(useSyncExternalStore) — 셀렉터 호출만
// 흉내 내면 subscribe/getState 가 없어 렌더가 터진다.
vi.mock('@duing/stores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/stores')>()),
  useAuthStore: Object.assign(
    (selector: (state: { status: string }) => unknown) => selector({ status: mockAuthStatus.value }),
    {
      subscribe: () => () => {},
      getState: () => ({ status: mockAuthStatus.value }),
      getInitialState: () => ({ status: mockAuthStatus.value }),
    },
  ),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import { NoticePage as NoticesPage } from '../../app/notices/_pages/NoticePage';

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

  it('커버 없는 공지는 목록·고정 카드에 "이미지 없음" 문구 없이 아이콘만 둔다', () => {
    const items = [
      makeNoticeItem({ id: 1, title: '고정 공지', pinned: true, coverImageUrl: '' }),
      makeNoticeItem({ id: 2, title: '일반 공지', coverImageUrl: '' }),
    ];
    mockUseNoticeListQuery.mockReturnValue(makeListResponse(items));

    render(<NoticesPage />);

    expect(screen.queryByText('이미지 없음')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '이미지 없음' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /고정 공지/ })).not.toHaveAccessibleName(/이미지 없음/);
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

  it('로딩을 거쳐 성공하면 목록 컨테이너에 enter-content 를 건다', () => {
    mockUseNoticeListQuery.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false, isError: false, error: null });
    const { rerender } = render(<NoticesPage />);

    // 실제 쿼리처럼 isPlaceholderData 를 false 로 채워야 컨테이너에 aria-busy 속성이 렌더된다.
    mockUseNoticeListQuery.mockReturnValue({
      ...makeListResponse([makeNoticeItem({ id: 1, title: '첫 번째 공지' })]),
      isPlaceholderData: false,
    });
    rerender(<NoticesPage />);

    // 목록 컨테이너 = aria-busy 를 가진 isSuccess div(필터 전환 중에도 언마운트되지 않는다).
    const listContainer = screen.getAllByText('첫 번째 공지')[0]?.closest('[aria-busy]');
    expect(listContainer).toHaveClass('enter-content');
  });

  it('처음부터 목록이 있어도(시드·캐시) 앞으로 들어온 마운트면 목록 컨테이너에 enter-content 를 건다', () => {
    mockUseNoticeListQuery.mockReturnValue({
      ...makeListResponse([makeNoticeItem({ id: 1, title: '첫 번째 공지' })]),
      isPlaceholderData: false,
    });
    render(<NoticesPage />);

    const listContainer = screen.getAllByText('첫 번째 공지')[0]?.closest('[aria-busy]');
    expect(listContainer).toHaveClass('enter-content');
  });

  it('뒤로·앞으로 가기로 그려지는 마운트(마커)는 목록 컨테이너에 enter-content 를 걸지 않는다', () => {
    document.documentElement.setAttribute('data-back-navigation', '');
    try {
      mockUseNoticeListQuery.mockReturnValue({
        ...makeListResponse([makeNoticeItem({ id: 1, title: '첫 번째 공지' })]),
        isPlaceholderData: false,
      });
      render(<NoticesPage />);

      const listContainer = screen.getAllByText('첫 번째 공지')[0]?.closest('[aria-busy]');
      expect(listContainer).not.toHaveClass('enter-content');
    } finally {
      document.documentElement.removeAttribute('data-back-navigation');
    }
  });
});

describe('NoticesPage — 고정 공지 3건 이상·빈 상태', () => {
  function searchFor(keyword: string) {
    const input = screen.getByRole('textbox', { name: '소식 검색' });
    fireEvent.change(input, { target: { value: keyword } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  it('고정 공지가 3건 이상이면 앞 2건은 강조 카드, 나머지는 일반 목록 맨 앞에 "고정" 표시와 함께 보인다', () => {
    mockAuthStatus.value = 'unauthenticated';
    mockUseNoticeListQuery.mockReturnValue(
      makeListResponse([
        makeNoticeItem({ id: 11, title: '핀A', pinned: true }),
        makeNoticeItem({ id: 12, title: '핀B', pinned: true }),
        makeNoticeItem({ id: 13, title: '핀C', pinned: true }),
        makeNoticeItem({ id: 14, title: '핀D', pinned: true }),
        makeNoticeItem({ id: 21, title: '일반A' }),
      ]),
    );

    const { container } = render(<NoticesPage />);

    // 강조 카드 2장 + 목록 행 3개(넘친 고정 2건이 백엔드 순서대로 맨 앞) — 어떤 고정 공지도 사라지지 않는다.
    expect(container.querySelectorAll('.tap-card')).toHaveLength(2);
    const rows = Array.from(container.querySelectorAll('.notice-row'));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('핀C');
    expect(rows[1]).toHaveTextContent('핀D');
    expect(rows[2]).toHaveTextContent('일반A');
    // "고정" 표시는 접근성 이름에 제목과 띄어서 들어간다 — 일반 행·강조 카드에는 없다(대조군).
    expect(screen.getByRole('link', { name: /고정 핀C/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /고정 핀D/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /일반A/ })).not.toHaveAccessibleName(/고정/);
    expect(screen.getByRole('link', { name: /핀A/ })).not.toHaveAccessibleName(/고정/);
    // 구분선은 마지막 행만 뺀다 — 합친 목록 기준(넘친 고정 + 일반). jsdom 은 'none' 을 'medium' 으로 바꿔 내놓는다.
    const rowBorders = rows.map((row) => (row instanceof HTMLElement ? row.style.borderBottom : ''));
    expect(rowBorders).toEqual([
      '1px solid var(--gray-line)',
      '1px solid var(--gray-line)',
      expect.not.stringContaining('gray-line'),
    ]);
  });

  it('넘친 고정 공지가 동아리 공지면 "고정" 표시가 제목 칸 첫 요소로 동아리 칩보다 앞선다', () => {
    mockAuthStatus.value = 'authenticated';
    mockUseNoticeListQuery.mockReturnValue(
      makeListResponse([
        makeNoticeItem({ id: 11, title: '핀A', pinned: true, owningClubId: 5, clubName: '알고리즘 동아리' }),
        makeNoticeItem({ id: 12, title: '핀B', pinned: true, owningClubId: 5, clubName: '알고리즘 동아리' }),
        makeNoticeItem({ id: 13, title: '핀C', pinned: true, owningClubId: 5, clubName: '알고리즘 동아리' }),
      ]),
    );

    const { container } = render(<NoticesPage />);
    fireEvent.click(screen.getByRole('button', { name: '내 동아리' }));

    expect(container.querySelector('.notice-row .nr-title')?.firstElementChild).toHaveTextContent('고정');
  });

  it('고정 공지만 있고 일반 공지가 없으면 빈 상태 문구도, 머리글만 남은 목록 표도 그리지 않는다', () => {
    mockAuthStatus.value = 'unauthenticated';
    mockUseNoticeListQuery.mockReturnValue(
      makeListResponse([
        makeNoticeItem({ id: 11, title: '핀A', pinned: true }),
        makeNoticeItem({ id: 12, title: '핀B', pinned: true }),
      ]),
    );

    const { container } = render(<NoticesPage />);

    expect(container.querySelectorAll('.tap-card')).toHaveLength(2);
    expect(screen.queryByText('아직 공지가 없습니다')).not.toBeInTheDocument();
    expect(container.querySelector('.md\\:bg-paper')).toBeNull();
  });

  it('검색 결과가 고정 공지 3건뿐이면 카드 2장 + 행 1개이고 "검색 결과가 없습니다." 는 없다', () => {
    mockAuthStatus.value = 'unauthenticated';
    mockUseNoticeListQuery.mockReturnValue(
      makeListResponse([
        makeNoticeItem({ id: 11, title: '핀A', pinned: true }),
        makeNoticeItem({ id: 12, title: '핀B', pinned: true }),
        makeNoticeItem({ id: 13, title: '핀C', pinned: true }),
      ]),
    );

    const { container } = render(<NoticesPage />);
    searchFor('핀');

    expect(container.querySelectorAll('.tap-card')).toHaveLength(2);
    expect(container.querySelectorAll('.notice-row')).toHaveLength(1);
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument();
  });

  it('검색 결과가 0건이면 "검색 결과가 없습니다." 를 보인다', () => {
    mockAuthStatus.value = 'unauthenticated';
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<NoticesPage />);
    searchFor('없는검색어');

    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('내 동아리 공지가 0건이면 "가입한 동아리의 공지가 없습니다" 를 보인다', () => {
    mockAuthStatus.value = 'authenticated';
    mockUseNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<NoticesPage />);
    fireEvent.click(screen.getByRole('button', { name: '내 동아리' }));

    expect(screen.getByText('가입한 동아리의 공지가 없습니다')).toBeInTheDocument();
  });
});

describe('NoticesPage — 불러오기 실패', () => {
  it('다시 불러오기가 실패해도 이미 보이던 목록은 그대로 두고, 위에 다시 시도 안내를 띄운다', () => {
    mockAuthStatus.value = 'unauthenticated';
    const refetch = vi.fn();
    // TanStack Query v5 는 데이터가 있는 상태에서 재요청이 실패하면 status 를 error(isSuccess false)로 바꾸되 data 는 남긴다.
    // 24시간 ISR 시드로 첫 화면을 그린 뒤 마운트 재요청이 시간 초과로 끝나는 경우가 이 상태다.
    mockUseNoticeListQuery.mockReturnValue({
      ...makeListResponse([makeNoticeItem({ id: 1, title: '이미 보이던 공지' })]),
      isSuccess: false,
      isError: true,
      error: new Error('요청 시간이 초과되었습니다.'),
      refetch,
    });

    render(<NoticesPage />);

    expect(screen.getByText('이미 보이던 공지')).toBeInTheDocument();
    expect(screen.queryByText('공지를 불러오지 못했습니다.')).not.toBeInTheDocument();
    const staleNotice = screen.getByRole('alert');
    expect(staleNotice).toHaveTextContent('최신 공지를 불러오지 못했습니다');
    fireEvent.click(within(staleNotice).getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('목록을 다시 불러오는 동안에는 안내의 버튼을 막고 진행 중임을 알린다 — 연타가 진행 중 요청을 취소·재시작하지 않게', () => {
    mockAuthStatus.value = 'unauthenticated';
    // 데이터가 있는 상태의 재요청은 진행 중에도 status 가 error 로 남는다 — 화면이 바뀌지 않으니 버튼으로 알린다.
    mockUseNoticeListQuery.mockReturnValue({
      ...makeListResponse([makeNoticeItem({ id: 1, title: '이미 보이던 공지' })]),
      isSuccess: false,
      isError: true,
      isFetching: true,
      error: new Error('요청 시간이 초과되었습니다.'),
      refetch: vi.fn(),
    });

    render(<NoticesPage />);

    expect(within(screen.getByRole('alert')).getByRole('button', { name: '다시 불러오는 중…' })).toBeDisabled();
  });

  it('처음 불러오기가 실패해 보여 줄 목록이 없으면 오류 안내와 다시 시도 버튼을 보여 준다', () => {
    mockAuthStatus.value = 'unauthenticated';
    const refetch = vi.fn();
    mockUseNoticeListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: new Error('요청 시간이 초과되었습니다.'),
      refetch,
    });

    render(<NoticesPage />);

    const loadError = screen.getByRole('alert');
    expect(loadError).toHaveTextContent('공지를 불러오지 못했습니다.');
    fireEvent.click(within(loadError).getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
