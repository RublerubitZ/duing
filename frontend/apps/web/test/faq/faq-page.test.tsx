import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FederationFaqItem } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// HomeFooter 는 인증 스토어·알림 훅 체인을 물고 있어 FAQ 본문과 무관한 복잡도를 늘리므로
// 단순 스텁으로 대체한다. ExploreNav 는 faq/layout.tsx 소유라 페이지 렌더에 포함되지 않는다.
vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav aria-label="정보" />,
}));

vi.mock('../../app/_components/HomeFooter', () => ({
  HomeFooter: () => <footer aria-label="푸터" />,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// 필터 상태는 URL searchParams 가 소스 — 테스트는 URLSearchParams 로 URL 상태를 주입하고,
// 상태 변경은 router.replace 호출 인자로 단언한다(FaqPage 의 parse/serialize 계약).
const mockRouterReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const mockUseFederationFaqCategoriesQuery = vi.fn();
const mockUseFederationFaqListQuery = vi.fn();
const mockUseFederationFaqDetailQuery = vi.fn();
// FaqAccordionRow/FaqDeepLinkCard 가 하단에 FaqFeedback 을 물고 있어(펼침 여부와 무관하게 항상
// 마운트) FAQ 본문과 무관한 이 훅도 모킹해 둔다 — 실제 동작은 faq-feedback.test.tsx 에서 검증한다.
const mockSubmitFeedbackMutateAsync = vi.fn();

vi.mock('@duing/hooks', () => ({
  useFederationFaqCategoriesQuery: (...args: unknown[]) => mockUseFederationFaqCategoriesQuery(...args),
  useFederationFaqListQuery: (...args: unknown[]) => mockUseFederationFaqListQuery(...args),
  useFederationFaqDetailQuery: (...args: unknown[]) => mockUseFederationFaqDetailQuery(...args),
  useSubmitFaqFeedbackMutation: () => ({ mutateAsync: mockSubmitFeedbackMutateAsync, isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

// useToast 는 ToastProvider 컨텍스트 밖에서 호출되면 예외를 던진다 — FAQ 본문과 무관하므로 스텁한다.
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
  useOptionalToast: () => vi.fn(),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import { FaqPage } from '../../app/faq/_pages/FaqPage';

function makeFaqItem(overrides: Partial<FederationFaqItem> = {}): FederationFaqItem {
  return {
    id: 1,
    categoryId: 1,
    categoryName: '일반',
    question: '테스트 질문입니다',
    answer: '테스트 답변입니다',
    pinned: false,
    ...overrides,
  };
}

function makeListResponse(items: FederationFaqItem[]) {
  return {
    data: { content: items, totalPages: Math.ceil(items.length / 20), totalElements: items.length },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('FaqPage', () => {
  beforeEach(() => {
    mockRouterReplace.mockReset();
    mockSearchParams = new URLSearchParams();
    mockUseFederationFaqCategoriesQuery.mockReset().mockReturnValue({ data: [] });
    mockUseFederationFaqListQuery.mockReset().mockReturnValue(makeListResponse([]));
    mockUseFederationFaqDetailQuery
      .mockReset()
      .mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mockSubmitFeedbackMutateAsync.mockReset();
  });

  it('목록에 고정 뱃지·질문·카테고리명이 노출된다', () => {
    const pinned = makeFaqItem({
      id: 1,
      question: '동아리 가입 절차가 궁금해요',
      categoryName: '가입',
      pinned: true,
    });
    const normal = makeFaqItem({
      id: 2,
      question: '동아리 탈퇴는 어떻게 하나요',
      categoryName: '탈퇴',
      pinned: false,
    });
    mockUseFederationFaqListQuery.mockReturnValue(makeListResponse([pinned, normal]));

    render(<FaqPage />);

    expect(screen.getByText('동아리 가입 절차가 궁금해요')).toBeInTheDocument();
    expect(screen.getByText('동아리 탈퇴는 어떻게 하나요')).toBeInTheDocument();
    expect(screen.getByText('고정')).toBeInTheDocument();
    expect(screen.getByText('가입')).toBeInTheDocument();
    expect(screen.getByText('탈퇴')).toBeInTheDocument();
    // 정상 목록에는 '이전 내용일 수 있다' 안내가 붙지 않는다(안내 줄은 data 가 있는 실패에서만).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // 실제 화면 행은 피드백 위젯을 단다(서버 기본 목록만 withFeedback=false).
    expect(screen.getAllByText('이 답변이 도움이 되었나요?')).toHaveLength(2);
  });

  it('URL 의 category·keyword·page 가 목록 조회 훅 인자로 매핑된다 (page 는 0-based 변환)', () => {
    mockSearchParams = new URLSearchParams('category=3&keyword=회비&page=2');

    render(<FaqPage />);

    expect(mockUseFederationFaqListQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: 3, keyword: '회비', page: 1, size: 20 }),
    );
  });

  it('검색어 입력만으로는 URL 이 갱신되지 않고, Enter 로 확정해야 keyword 를 포함해 router.replace 가 호출된다', () => {
    render(<FaqPage />);

    const input = screen.getByPlaceholderText('질문을 검색하세요');
    fireEvent.change(input, { target: { value: '휴학' } });

    // 입력만 한 상태에서는 URL 갱신도, 훅 호출 인자 반영도 없다.
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(
      mockUseFederationFaqListQuery.mock.calls.some((call) => call[0]?.keyword === '휴학'),
    ).toBe(false);

    fireEvent.keyDown(input, { key: 'Enter' });

    const expectedQuery = new URLSearchParams({ keyword: '휴학' }).toString();
    expect(mockRouterReplace).toHaveBeenCalledWith(`/faq?${expectedQuery}`, { scroll: false });
  });

  it('검색 input 은 100자까지만 입력받는다 — 서버가 100자를 넘는 검색어를 400 으로 거절한다', () => {
    render(<FaqPage />);

    expect(screen.getByRole('textbox', { name: '질문 검색' })).toHaveAttribute('maxLength', '100');
  });

  it('검색어·카테고리 없이 목록이 비면 등록된 질문이 없다는 안내와 1:1 문의 CTA 가 노출된다', () => {
    mockUseFederationFaqListQuery.mockReturnValue(makeListResponse([]));

    render(<FaqPage />);

    expect(
      screen.getByText('아직 등록된 질문이 없어요 · 궁금한 점은 아래 1:1 문의로 보내주세요'),
    ).toBeInTheDocument();
    const inquiryLink = screen.getByRole('link', { name: '1:1 문의하기' });
    expect(inquiryLink).toHaveAttribute('href', '/me/inquiries/new');
  });

  it('검색어가 있는데 결과가 없으면 검색 결과 없음 문구가 노출된다', () => {
    mockSearchParams = new URLSearchParams('keyword=회비');
    mockUseFederationFaqListQuery.mockReturnValue(makeListResponse([]));

    render(<FaqPage />);

    expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument();
  });

  it('범위 밖 페이지 딥링크(page=99)로 목록이 비면 등록된 질문 없음이 아니라 결과 없음 문구가 노출된다', () => {
    mockSearchParams = new URLSearchParams('page=99');
    mockUseFederationFaqListQuery.mockReturnValue(makeListResponse([]));

    render(<FaqPage />);

    expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument();
    expect(
      screen.queryByText('아직 등록된 질문이 없어요 · 궁금한 점은 아래 1:1 문의로 보내주세요'),
    ).not.toBeInTheDocument();
  });

  it('item 쿼리스트링으로 진입하면 FaqDeepLinkCard 가 렌더되고 해당 id 로 상세 조회 훅이 호출된다', () => {
    mockSearchParams = new URLSearchParams('item=5');
    mockUseFederationFaqDetailQuery.mockReturnValue({
      data: makeFaqItem({ id: 5, question: '공유된 질문 내용' }),
      isLoading: false,
      isError: false,
    });

    render(<FaqPage />);

    expect(screen.getByText('공유된 질문')).toBeInTheDocument();
    expect(screen.getByText('공유된 질문 내용')).toBeInTheDocument();
    expect(mockUseFederationFaqDetailQuery).toHaveBeenCalledWith(5);
  });

  it('item 이 양의 안전 정수가 아니면(-3, abc) 딥링크 카드를 렌더하지 않는다', () => {
    mockSearchParams = new URLSearchParams('item=-3');
    const { unmount } = render(<FaqPage />);
    expect(screen.queryByText('공유된 질문')).not.toBeInTheDocument();
    expect(mockUseFederationFaqDetailQuery).not.toHaveBeenCalled();
    unmount();

    mockSearchParams = new URLSearchParams('item=abc');
    render(<FaqPage />);
    expect(screen.queryByText('공유된 질문')).not.toBeInTheDocument();
    expect(mockUseFederationFaqDetailQuery).not.toHaveBeenCalled();
  });

  it('딥링크 대상 FAQ 조회가 에러이면 "해당 FAQ를 찾을 수 없어요" 문구가 보인다', () => {
    mockSearchParams = new URLSearchParams('item=5');
    mockUseFederationFaqDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<FaqPage />);

    expect(screen.getByText('해당 FAQ를 찾을 수 없어요')).toBeInTheDocument();
  });

  it('딥링크가 열린 상태에서 카테고리 칩을 누르면 item 이 제거된 URL 로 교체된다', () => {
    mockSearchParams = new URLSearchParams('item=5');
    mockUseFederationFaqCategoriesQuery.mockReturnValue({
      data: [{ id: 3, name: '가입', sortOrder: 1 }],
    });
    mockUseFederationFaqDetailQuery.mockReturnValue({
      data: makeFaqItem({ id: 5 }),
      isLoading: false,
      isError: false,
    });

    render(<FaqPage />);

    fireEvent.click(screen.getByRole('button', { name: '가입' }));

    expect(mockRouterReplace).toHaveBeenCalledWith('/faq?category=3', { scroll: false });
  });
});

describe('FaqPage — 불러오기 실패', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockUseFederationFaqCategoriesQuery.mockReset().mockReturnValue({ data: [] });
    mockUseFederationFaqDetailQuery
      .mockReset()
      .mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('다시 불러오기가 실패해도 이미 보이던 목록은 그대로 두고, 위에 다시 시도 안내를 띄운다', () => {
    const refetch = vi.fn();
    // TanStack Query v5 는 데이터가 있는 상태에서 재요청이 실패하면 status 를 error(isSuccess false)로 바꾸되 data 는 남긴다.
    // 24시간 ISR 시드로 첫 화면을 그린 뒤 마운트 재요청이 시간 초과로 끝나는 경우가 이 상태다.
    mockUseFederationFaqListQuery.mockReset().mockReturnValue({
      ...makeListResponse([makeFaqItem({ id: 1, question: '이미 보이던 질문' })]),
      isSuccess: false,
      isError: true,
      isFetching: false,
      error: new Error('요청 시간이 초과되었습니다.'),
      refetch,
    });

    render(<FaqPage />);

    expect(screen.getByText('이미 보이던 질문')).toBeInTheDocument();
    expect(screen.queryByText('FAQ를 불러오지 못했습니다')).not.toBeInTheDocument();
    const staleNotice = screen.getByRole('alert');
    expect(staleNotice).toHaveTextContent(
      '최신 질문을 불러오지 못했습니다. 지금 보이는 목록은 이전 내용일 수 있습니다.',
    );
    fireEvent.click(within(staleNotice).getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('목록을 다시 불러오는 동안에는 안내의 버튼을 막고 진행 중임을 알린다 — 연타가 진행 중 요청을 취소·재시작하지 않게', () => {
    mockUseFederationFaqListQuery.mockReset().mockReturnValue({
      ...makeListResponse([makeFaqItem({ id: 1, question: '이미 보이던 질문' })]),
      isSuccess: false,
      isError: true,
      isFetching: true,
      error: new Error('요청 시간이 초과되었습니다.'),
      refetch: vi.fn(),
    });

    render(<FaqPage />);

    expect(
      within(screen.getByRole('alert')).getByRole('button', { name: '다시 불러오는 중…' }),
    ).toBeDisabled();
    // 다시 받는 동안에도 목록 위에 스켈레톤을 겹치지 않는다 — 로딩 표시는 보여 줄 data 가 없을 때(isLoading)뿐이다.
    expect(screen.queryByLabelText('FAQ 목록 불러오는 중')).not.toBeInTheDocument();
    expect(screen.getByText('이미 보이던 질문')).toBeInTheDocument();
  });

  it('처음 불러오기가 실패해 보여 줄 목록이 없으면 오류 문구만 보이고 목록·안내 줄은 없다', () => {
    mockUseFederationFaqListQuery.mockReset().mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      isFetching: false,
      error: new Error('요청 시간이 초과되었습니다.'),
      refetch: vi.fn(),
    });

    render(<FaqPage />);

    expect(screen.getByText('FAQ를 불러오지 못했습니다')).toBeInTheDocument();
    // '이전 내용일 수 있다' 안내 줄은 보여 줄 목록이 있을 때만 — 문구로 확인한다(전체 오류에 role 을 붙여도 흔들리지 않게).
    expect(screen.queryByText(/최신 질문을 불러오지 못했습니다/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('아직 등록된 질문이 없어요 · 궁금한 점은 아래 1:1 문의로 보내주세요'),
    ).not.toBeInTheDocument();
  });
});
