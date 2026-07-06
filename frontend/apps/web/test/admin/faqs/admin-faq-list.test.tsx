import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminFederationFaqSummary } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUseFederationFaqCategoriesQuery = vi.fn();
const mockUseAdminFederationFaqListQuery = vi.fn();
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

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminFaqListPage', () => {
  beforeEach(() => {
    mockUseFederationFaqCategoriesQuery.mockReset().mockReturnValue({ data: [], isLoading: false, isSuccess: true });
    mockUseAdminFederationFaqListQuery.mockReset();
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
});
