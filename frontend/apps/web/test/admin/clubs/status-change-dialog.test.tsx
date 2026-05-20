import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminClubSummary } from '@duing/types';
import type { StatusAction } from '../../../app/admin/clubs/_lib/clubStatus';
import { AdminClubStatusChangeDialog } from '../../../app/admin/clubs/_components/AdminClubStatusChangeDialog';

/* ── 테스트 데이터 헬퍼 ───────────────────────────────────────── */
function makeClub(overrides: Partial<AdminClubSummary> = {}): AdminClubSummary {
  return {
    id: 1,
    name: '테스트 동아리',
    category: 'ACADEMIC',
    division: null,
    logoUrl: null,
    status: 'PENDING_APPROVAL',
    tags: [],
    leaderId: null,
    leaderName: null,
    leaderStudentId: null,
    centralClub: false,
    rejectionReason: null,
    statusChangedAt: null,
    statusChangedByName: null,
    ...overrides,
  };
}

function makeAction(overrides: Partial<StatusAction> = {}): StatusAction {
  return {
    label: '거절',
    nextStatus: 'REJECTED',
    tone: 'danger',
    description: '거절 상태로 변경합니다.',
    ...overrides,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminClubStatusChangeDialog', () => {
  it('action.nextStatus === "REJECTED" 일 때 textarea 가 보이고 빈 상태에서 제출 버튼이 비활성', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubStatusChangeDialog
        club={makeClub()}
        action={makeAction({ nextStatus: 'REJECTED' })}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox')).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: '거절' });
    expect(submitButton).toBeDisabled();
  });

  it('정상 reason 입력 후 제출 시 onConfirm 이 trimmed reason 으로 호출', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubStatusChangeDialog
        club={makeClub()}
        action={makeAction({ nextStatus: 'REJECTED' })}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  활동 미흡  ' } });
    fireEvent.click(screen.getByRole('button', { name: '거절' }));

    expect(onConfirm.mock.calls[0]?.[0]).toBe('활동 미흡');
  });

  it('action.nextStatus === "ACTIVE" 일 때 textarea 미노출 + onConfirm 이 undefined 로 호출', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubStatusChangeDialog
        club={makeClub({ status: 'INACTIVE' })}
        action={makeAction({ label: '재활성', nextStatus: 'ACTIVE', tone: 'primary', description: '재활성합니다.' })}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '재활성' }));

    expect(onConfirm.mock.calls[0]?.[0]).toBeUndefined();
  });
});
