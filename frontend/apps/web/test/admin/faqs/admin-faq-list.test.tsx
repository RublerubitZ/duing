import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminFederationFaqSummary, AdminFederationFaqSearchMiss } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUseFederationFaqCategoriesQuery = vi.fn();
const mockUseAdminFederationFaqListQuery = vi.fn();
const mockUseAdminFaqSearchMissesQuery = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockReorderMutate = vi.fn();

vi.mock('@duing/hooks', () => ({
  useFederationFaqCategoriesQuery: (...args: unknown[]) => mockUseFederationFaqCategoriesQuery(...args),
  useAdminFederationFaqListQuery: (...args: unknown[]) => mockUseAdminFederationFaqListQuery(...args),
  useAdminFederationFaqUpdateMutation: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useAdminFederationFaqDeleteMutation: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useAdminFederationFaqReorderMutation: () => ({ mutate: mockReorderMutate, isPending: false }),
  // FaqCategoryManager(접힌 상태로 렌더)가 물고 있는 훅 — 이번 테스트에서는 직접 사용하지 않지만
  // 모듈 전체 모킹 시 정의되어 있지 않으면 호출 시 TypeError 가 난다.
  useAdminFederationFaqCategoryCreateMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useAdminFederationFaqCategoryUpdateMutation: () => ({ mutate: vi.fn(), isPending: false }),
  // FaqSearchMissPanel(접힌 상태로 렌더)가 물고 있는 훅 — 위와 동일한 이유로 팩토리에 위임 필요.
  useAdminFederationFaqSearchMissesQuery: (...args: unknown[]) => mockUseAdminFaqSearchMissesQuery(...args),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import { AdminFaqListPage } from '../../../app/admin/faqs/_pages/AdminFaqListPage';

function makeAdminFaqItem(overrides: Partial<AdminFederationFaqSummary> = {}): AdminFederationFaqSummary {
  return {
    id: 1,
    categoryId: 1,
    categoryName: '일반',
    question: '테스트 질문',
    answer: '테스트 답변',
    pinned: false,
    published: true,
    sortOrder: 0,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makeListResponse(items: AdminFederationFaqSummary[]) {
  return {
    data: { content: items, totalPages: Math.ceil(items.length / 20), totalElements: items.length },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/**
 * 목록(size=20) 쿼리와 전체목록(size=500) 쿼리 — 훅이 두 번 호출되므로(useAdminFederationFaqListQuery
 * 를 필터 파라미터·전체목록 파라미터로 각각 호출) 같은 items 로 응답하도록 모킹한다. 이 파일의
 * 테스트들은 두 응답 내용이 다른지 여부를 검증하지 않으므로 인자와 무관하게 동일 응답을 반환한다.
 */
function mockListAndFullList(items: AdminFederationFaqSummary[]) {
  mockUseAdminFederationFaqListQuery.mockImplementation(() => makeListResponse(items));
}

function makeSearchMissResponse(items: AdminFederationFaqSearchMiss[], totalPages = 1) {
  return {
    data: { content: items, totalPages, totalElements: items.length },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminFaqListPage', () => {
  beforeEach(() => {
    mockUseFederationFaqCategoriesQuery.mockReset().mockReturnValue({ data: [], isLoading: false, isSuccess: true });
    mockUseAdminFederationFaqListQuery.mockReset();
    mockUseAdminFaqSearchMissesQuery.mockReset().mockReturnValue(makeSearchMissResponse([]));
    mockUpdateMutate.mockReset();
    mockDeleteMutate.mockReset();
    mockReorderMutate.mockReset();
  });

  it('테이블에 공개/비공개 뱃지·질문·카테고리명이 노출된다', () => {
    const items = [
      makeAdminFaqItem({ id: 1, question: '공개된 질문', categoryName: '일반', published: true }),
      makeAdminFaqItem({ id: 2, question: '비공개 질문', categoryName: '행사', published: false }),
    ];
    mockListAndFullList(items);

    render(<AdminFaqListPage />);

    // PUBLISHED_OPTIONS 필터 버튼("공개"/"비공개")과 테이블 헤더("공개" 칼럼명)에도 같은 텍스트가
    // 있어 tbody 로 범위를 좁힌다.
    const tbody = screen.getByRole('table').querySelector('tbody')!;
    expect(within(tbody).getByText('공개된 질문')).toBeInTheDocument();
    expect(within(tbody).getByText('비공개 질문')).toBeInTheDocument();
    expect(within(tbody).getByText('일반')).toBeInTheDocument();
    expect(within(tbody).getByText('행사')).toBeInTheDocument();
    expect(within(tbody).getByText('공개')).toBeInTheDocument();
    expect(within(tbody).getByText('비공개')).toBeInTheDocument();
  });

  it('삭제 버튼 → 다이얼로그 확인 시 deleteMutation.mutate(id) 가 호출된다', () => {
    const item = makeAdminFaqItem({ id: 42, question: '삭제할 FAQ' });
    mockListAndFullList([item]);

    render(<AdminFaqListPage />);

    // 테이블의 삭제 버튼 클릭 (아직 다이얼로그 밖 → 유일한 "삭제" 버튼)
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(screen.getByText('FAQ를 삭제할까요?')).toBeInTheDocument();

    // 다이얼로그 안 확인(삭제) 버튼은 두 번째로 나타난 "삭제" 버튼
    const deleteButtons = screen.getAllByRole('button', { name: '삭제' });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!);

    expect(mockDeleteMutate).toHaveBeenCalledWith(42, expect.any(Object));
  });

  it('피드백 컬럼에 도움됨/아쉬움 카운트가 "N / M" 형태로 노출되고 aria-label 이 부여된다', () => {
    const items = [
      makeAdminFaqItem({ id: 1, question: '피드백 질문', helpfulCount: 12, notHelpfulCount: 3 }),
    ];
    mockListAndFullList(items);

    render(<AdminFaqListPage />);

    const feedbackCell = screen.getByLabelText('도움됐어요 12건 · 아쉬워요 3건');
    expect(feedbackCell).toHaveTextContent('12 / 3');
    expect(feedbackCell).toHaveAttribute('title', '도움됐어요 12 · 아쉬워요 3');
    expect(feedbackCell).not.toHaveClass('text-coral');
  });

  it('아쉬워요가 도움됐어요보다 많으면 피드백 카운트가 text-coral 로 강조된다', () => {
    const items = [
      makeAdminFaqItem({ id: 1, question: '갭 질문', helpfulCount: 2, notHelpfulCount: 5 }),
    ];
    mockListAndFullList(items);

    render(<AdminFaqListPage />);

    const feedbackCell = screen.getByLabelText('도움됐어요 2건 · 아쉬워요 5건');
    expect(feedbackCell).toHaveClass('text-coral');
  });

  it('키워드 검색을 확정하면(필터 활성) 순서 이동 버튼이 비활성화되고 안내 tooltip 이 노출된다', () => {
    const items = [
      makeAdminFaqItem({ id: 1, question: '첫 번째 질문' }),
      makeAdminFaqItem({ id: 2, question: '가운데 질문' }),
      makeAdminFaqItem({ id: 3, question: '세 번째 질문' }),
    ];
    mockListAndFullList(items);

    render(<AdminFaqListPage />);

    // 가운데(경계가 아닌) 항목은 필터 적용 전엔 위/아래 이동이 모두 가능하다.
    const upButtonsBefore = screen.getAllByRole('button', { name: '위로 이동' });
    const downButtonsBefore = screen.getAllByRole('button', { name: '아래로 이동' });
    expect(upButtonsBefore[1]).not.toBeDisabled();
    expect(downButtonsBefore[1]).not.toBeDisabled();

    const keywordInput = screen.getByPlaceholderText('질문 검색');
    fireEvent.change(keywordInput, { target: { value: '가운데' } });
    fireEvent.submit(keywordInput.closest('form')!);

    const upButtonsAfter = screen.getAllByRole('button', { name: '위로 이동' });
    const downButtonsAfter = screen.getAllByRole('button', { name: '아래로 이동' });

    expect(upButtonsAfter[1]).toBeDisabled();
    expect(upButtonsAfter[1]).toHaveAttribute('title', '필터를 해제하면 순서를 바꿀 수 있어요');
    expect(downButtonsAfter[1]).toBeDisabled();
    expect(downButtonsAfter[1]).toHaveAttribute('title', '필터를 해제하면 순서를 바꿀 수 있어요');
  });

  it('무결과 검색어 패널은 기본 접힘으로 렌더되고 내용은 노출되지 않는다', () => {
    mockListAndFullList([]);
    mockUseAdminFaqSearchMissesQuery.mockReturnValue(
      makeSearchMissResponse([{ keyword: '동아리방 예약', missCount: 5, lastSearchedAt: '2026-07-01T12:00:00' }]),
    );

    render(<AdminFaqListPage />);

    const panelToggle = screen.getByRole('button', { name: /무결과 검색어/ });
    expect(panelToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('동아리방 예약')).not.toBeInTheDocument();
    // 접힌 동안은 enabled=false 로 fetch 하지 않는다(lazy) — 훅 배선 회귀 방어.
    expect(mockUseAdminFaqSearchMissesQuery).toHaveBeenCalledWith({ page: 0, size: 10 }, false);
  });

  it('패널을 펼치면 무결과 검색어가 횟수·마지막 검색일과 함께 테이블로 노출된다', () => {
    mockListAndFullList([]);
    mockUseAdminFaqSearchMissesQuery.mockReturnValue(
      makeSearchMissResponse([
        { keyword: '동아리방 예약', missCount: 5, lastSearchedAt: '2026-07-01T12:00:00' },
        { keyword: '주차 등록', missCount: 2, lastSearchedAt: '2026-06-15T09:30:00' },
      ]),
    );

    render(<AdminFaqListPage />);

    fireEvent.click(screen.getByRole('button', { name: /무결과 검색어/ }));

    expect(screen.getByRole('button', { name: /무결과 검색어/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('동아리방 예약')).toBeInTheDocument();
    expect(screen.getByText('주차 등록')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2026. 7. 1.')).toBeInTheDocument();
    // 펼치면 enabled=true 로 fetch 가 켜진다 — 훅 배선 회귀 방어.
    expect(mockUseAdminFaqSearchMissesQuery).toHaveBeenLastCalledWith({ page: 0, size: 10 }, true);
  });

  it('무결과 검색어가 없으면 빈 상태 문구가 노출된다', () => {
    mockListAndFullList([]);
    mockUseAdminFaqSearchMissesQuery.mockReturnValue(makeSearchMissResponse([]));

    render(<AdminFaqListPage />);

    fireEvent.click(screen.getByRole('button', { name: /무결과 검색어/ }));

    expect(screen.getByText('아직 무결과 검색어가 없어요')).toBeInTheDocument();
  });

  it('무결과 검색어가 여러 페이지면 페이지네이션이 노출된다', () => {
    mockListAndFullList([]);
    mockUseAdminFaqSearchMissesQuery.mockReturnValue(
      makeSearchMissResponse(
        [{ keyword: '동아리방 예약', missCount: 5, lastSearchedAt: '2026-07-01T12:00:00' }],
        2,
      ),
    );

    render(<AdminFaqListPage />);

    fireEvent.click(screen.getByRole('button', { name: /무결과 검색어/ }));

    const paginationNav = screen.getByRole('navigation', { name: '무결과 검색어 페이지' });
    expect(paginationNav).toBeInTheDocument();

    // 페이지 버튼 클릭이 훅의 page 파라미터로 이어지는지(onChange 배선) 단언한다.
    fireEvent.click(within(paginationNav).getByRole('button', { name: '2' }));
    expect(mockUseAdminFaqSearchMissesQuery).toHaveBeenLastCalledWith({ page: 1, size: 10 }, true);
  });
});
