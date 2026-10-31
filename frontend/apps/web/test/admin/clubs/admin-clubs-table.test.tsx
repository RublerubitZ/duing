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

function renderTable(club: AdminClubSummary, onCloseClick = vi.fn(), onPendingCleanupClick = vi.fn()) {
  render(
    <AdminClubsTable
      clubs={[club]}
      onActionClick={vi.fn()}
      onCentralClubToggleClick={vi.fn()}
      onSecuredTargetToggleClick={vi.fn()}
      onCloseClick={onCloseClick}
      onPendingCleanupClick={onPendingCleanupClick}
    />,
  );
  return { onCloseClick, onPendingCleanupClick };
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

describe('AdminClubsTable 남은 미결 정리', () => {
  it('운영 중단 동아리에 남은 미결이 있으면 상태 아래 건수와, 재활성 앞에 같은 크기의 정리 버튼을 둔다', () => {
    renderTable(makeClub({ status: 'INACTIVE', undecidedApplicationCount: 3, pendingJoinRequestCount: 1 }));
    expect(screen.getByText('남은 지원서 3 · 가입 신청 1')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '중앙 지정', '확보 지정', '남은 미결 정리', '재활성', '삭제',
    ]);
    // 이 표의 동작 버튼은 모두 같은 크기다 — 이 버튼만 44px 로 키우지 않는다(스펙 §5-1)
    expect(screen.getByRole('button', { name: '남은 미결 정리' })).toHaveClass('px-2.5', 'py-1', 'text-xs');
  });

  it.each([
    ['가입 신청만', { undecidedApplicationCount: 0, pendingJoinRequestCount: 2 }, '남은 가입 신청 2'],
    ['지원서만', { undecidedApplicationCount: 2, pendingJoinRequestCount: 0 }, '남은 지원서 2'],
  ])('%s 남았으면 0건인 쪽을 뺀다', (_label, counts, text) => {
    renderTable(makeClub({ status: 'INACTIVE', ...counts }));
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each<[string, Partial<AdminClubSummary>]>([
    ['남은 미결이 없는 운영 중단', { status: 'INACTIVE', undecidedApplicationCount: 0, pendingJoinRequestCount: 0 }],
    ['건수 필드가 없는 옛 백엔드', { status: 'INACTIVE' }],
    ['운영 중(건수 null)', { status: 'ACTIVE', undecidedApplicationCount: null, pendingJoinRequestCount: null }],
  ])('%s 동아리에는 건수·정리 버튼이 없다', (_label, overrides) => {
    renderTable(makeClub(overrides));
    expect(screen.queryByRole('button', { name: '남은 미결 정리' })).toBeNull();
    expect(screen.queryByText(/^남은 /)).toBeNull();
  });

  it('정리 버튼은 그 동아리와 표에 보인 건수로 확인 창을 연다', () => {
    const club = makeClub({ id: 9, status: 'INACTIVE', undecidedApplicationCount: 3, pendingJoinRequestCount: 1 });
    const { onPendingCleanupClick } = renderTable(club);
    fireEvent.click(screen.getByRole('button', { name: '남은 미결 정리' }));
    expect(onPendingCleanupClick).toHaveBeenCalledWith(club, { applications: 3, joinRequests: 1 });
  });
});
