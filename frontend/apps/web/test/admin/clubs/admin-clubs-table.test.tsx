import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminClubSummary } from '@duing/types';
import { AdminClubsTable } from '../../../app/admin/clubs/_components/AdminClubsTable';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

/* ── 테스트 데이터 헬퍼 ───────────────────────────────────────── */
function makeClub(overrides: Partial<AdminClubSummary> = {}): AdminClubSummary {
  return {
    id: 1,
    name: '테스트 동아리',
    category: 'ACADEMIC',
    division: null,
    college: null,
    logoUrl: null,
    status: 'PENDING_APPROVAL',
    tags: [],
    leaderId: null,
    leaderName: null,
    leaderStudentId: null,
    centralClub: false,
  facilitySecuredTimeTarget: false,
    rejectionReason: null,
    statusChangedAt: null,
    statusChangedByName: null,
    ...overrides,
  };
}

function renderTable(club: AdminClubSummary, onCloseClick = vi.fn()) {
  render(
    <AdminClubsTable
      clubs={[club]}
      onActionClick={vi.fn()}
      onCentralClubToggleClick={vi.fn()}
      onSecuredTargetToggleClick={vi.fn()}
      onCloseClick={onCloseClick}
    />,
  );
  return { onCloseClick };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminClubsTable 삭제 버튼 노출', () => {
  it('REJECTED 동아리 행은 "재심사 대기로 전환" 과 "삭제" 버튼을 모두 노출한다', () => {
    renderTable(makeClub({ status: 'REJECTED' }));
    expect(screen.getByRole('button', { name: '재심사 대기로 전환' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('INACTIVE 동아리 행은 "재활성" 과 "삭제" 버튼을 노출한다', () => {
    renderTable(makeClub({ status: 'INACTIVE' }));
    expect(screen.getByRole('button', { name: '재활성' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('ACTIVE 동아리 행은 "삭제" 버튼을 노출하지 않는다', () => {
    renderTable(makeClub({ status: 'ACTIVE' }));
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('PENDING_APPROVAL 동아리 행은 "삭제" 버튼을 노출하지 않는다', () => {
    renderTable(makeClub({ status: 'PENDING_APPROVAL' }));
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('"삭제" 클릭 시 onCloseClick 이 해당 동아리로 호출된다', () => {
    const rejectedClub = makeClub({ status: 'REJECTED', id: 7, name: '거절 동아리' });
    const { onCloseClick } = renderTable(rejectedClub);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onCloseClick).toHaveBeenCalledWith(rejectedClub);
  });
});
