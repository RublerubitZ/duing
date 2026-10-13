import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AdminPendingCounts } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockPendingCountsQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminPendingCountsQuery: () => mockPendingCountsQuery(),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import AdminIndexPage from '@/app/admin/page';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
const COUNTS: AdminPendingCounts = {
  clubApproval: 2,
  facilityBooking: 3,
  inquiryUnanswered: 7,
  promotionRequest: 1,
  reportUnresolved: 5,
  leaderSuccession: 0,
  stalePendingRecruitment: 4,
  totalPendingCount: 22,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPendingCountsQuery.mockReturnValue({ data: COUNTS });
});

describe('관리자 콘솔 첫 화면', () => {
  it('미처리 건수가 있는 섹션 카드에 사이드바와 같은 건수를 표시한다', () => {
    render(<AdminIndexPage />);

    expect(screen.getByRole('link', { name: /모집 관리/ })).toHaveTextContent('4건 처리 대기');
    expect(screen.getByRole('link', { name: /1:1 문의/ })).toHaveTextContent('7건 처리 대기');
    expect(screen.getByRole('link', { name: /홍보 요청/ })).toHaveTextContent('1건 처리 대기');
  });

  it('0건이거나 미처리 집계가 없는 섹션 카드는 건수를 숨긴다', () => {
    render(<AdminIndexPage />);

    expect(screen.getByRole('link', { name: /회장 승계/ })).not.toHaveTextContent('처리 대기');
    expect(screen.getByRole('link', { name: /공지 관리/ })).not.toHaveTextContent('처리 대기');
  });

  it('집계를 받기 전에는 어느 카드에도 건수를 표시하지 않는다', () => {
    mockPendingCountsQuery.mockReturnValue({ data: undefined });

    render(<AdminIndexPage />);

    expect(screen.getByRole('link', { name: /모집 관리/ })).toBeInTheDocument();
    expect(screen.queryByText(/처리 대기/)).toBeNull();
  });
});
