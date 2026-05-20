import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminNoticeSummary } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUseAdminNoticeListQuery = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminNoticeListQuery: (...args: unknown[]) => mockUseAdminNoticeListQuery(...args),
  useAdminNoticeDeleteMutation: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
import { AdminNoticesListPage } from '../../../app/admin/notices/_pages/AdminNoticesListPage';

function makeNoticeItem(overrides: Partial<AdminNoticeSummary> = {}): AdminNoticeSummary {
  return {
    id: 1,
    title: '테스트 공지',
    category: 'GENERAL',
    visibility: 'PUBLIC',
    pinned: false,
    notifyOnPublish: false,
    expiresAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makeListResponse(items: AdminNoticeSummary[]) {
  return {
    data: { content: items, totalPages: Math.ceil(items.length / 20), totalElements: items.length },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminNoticesListPage', () => {
  it('결과가 없으면 "조건에 맞는 공지가 없습니다." 문구가 보인다', () => {
    mockUseAdminNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<AdminNoticesListPage />);

    expect(screen.getByText('조건에 맞는 공지가 없습니다.')).toBeInTheDocument();
  });

  it('visibility 필터 변경 시 visibility=PUBLIC, page=0 으로 훅이 호출된다', () => {
    mockUseAdminNoticeListQuery.mockReturnValue(makeListResponse([]));

    render(<AdminNoticesListPage />);

    // 초기 호출: visibility=undefined (ALL), page=0
    expect(mockUseAdminNoticeListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: undefined, page: 0 }),
    );

    // visibility select 를 PUBLIC 으로 변경
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PUBLIC' } });

    expect(mockUseAdminNoticeListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'PUBLIC', page: 0 }),
    );
  });

  it('삭제 버튼 → 다이얼로그 확인 시 deleteMutation.mutate(id) 가 호출된다', () => {
    mockDeleteMutate.mockReset();
    const item = makeNoticeItem({ id: 42, title: '삭제할 공지' });
    mockUseAdminNoticeListQuery.mockReturnValue(makeListResponse([item]));

    render(<AdminNoticesListPage />);

    // 테이블의 삭제 버튼 클릭 (첫 번째 "삭제" 버튼)
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    // 다이얼로그가 나타나야 한다
    expect(screen.getByText('공지를 삭제할까요?')).toBeInTheDocument();

    // 다이얼로그 안 확인(삭제) 버튼은 두 번째로 나타난 "삭제" 버튼
    const deleteButtons = screen.getAllByRole('button', { name: '삭제' });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!);

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      42,
      expect.any(Object),
    );
  });
});
