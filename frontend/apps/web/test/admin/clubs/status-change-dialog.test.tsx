import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminClubSummary } from '@duing/types';
import { STATUS_ACTIONS, type StatusAction } from '../../../app/admin/clubs/_lib/clubStatus';
import { AdminClubStatusChangeDialog } from '../../../app/admin/clubs/_components/AdminClubStatusChangeDialog';

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

  it('처리 실패 문구는 role="alert" 로 노출되어 스크린리더가 읽는다', () => {
    render(
      <AdminClubStatusChangeDialog
        club={makeClub()}
        action={makeAction()}
        isPending={false}
        errorMessage="상태 변경에 실패했습니다."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('상태 변경에 실패했습니다.');
  });

  it('처리 중에만 status 리전에 동작별 문구를 싣는다', () => {
    const props = {
      club: makeClub(),
      action: makeAction({ label: '승인', nextStatus: 'ACTIVE', tone: 'primary' }),
      errorMessage: null,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    } as const;
    const { rerender } = render(<AdminClubStatusChangeDialog {...props} isPending />);
    expect(screen.getByRole('status')).toHaveTextContent('승인 중');

    rerender(<AdminClubStatusChangeDialog {...props} isPending={false} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('운영 중단 확인창은 결과 없는 지원이 학생에게 "결과 미발표"로 남고 재활성하면 확정할 수 있다고 안내한다', () => {
    const deactivate = STATUS_ACTIONS.ACTIVE.find((action) => action.nextStatus === 'INACTIVE');
    if (!deactivate) throw new Error('운영 중단 액션이 없습니다.');
    render(
      <AdminClubStatusChangeDialog
        club={makeClub({ status: 'ACTIVE' })}
        action={deactivate}
        isPending={false}
        errorMessage={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/'결과 미발표'로 남고/)).toBeInTheDocument();
    expect(screen.getByText(/재활성하면 운영진이 결과를 확정할 수 있습니다/)).toBeInTheDocument();
  });
});

describe('동아리 운영 중단 안내', () => {
  it('진행 중인 모집이 마감된다는 사실과 되돌릴 수 없음을 함께 알린다', () => {
    // 실제로는 운영 중단이 OPEN 모집을 일괄 마감하는데, 안내가 "그대로 유지된다"고만 말하고 있었다.
    const deactivate = STATUS_ACTIONS.ACTIVE.find((action) => action.nextStatus === 'INACTIVE');

    expect(deactivate?.description).toContain('마감');
    expect(deactivate?.description).toContain('되돌릴 수 없');
  });

  it('재활성 안내는 마감된 모집이 되살아나는 것처럼 말하지 않는다', () => {
    const reactivate = STATUS_ACTIONS.INACTIVE.find((action) => action.nextStatus === 'ACTIVE');

    expect(reactivate?.description).toContain('복구되지 않');
  });

  it('재활성 안내는 운영 중단 안내와 짝을 맞춰 결과 없는 지원을 운영진이 이어서 확정할 수 있다고 알린다', () => {
    const reactivate = STATUS_ACTIONS.INACTIVE.find((action) => action.nextStatus === 'ACTIVE');

    expect(reactivate?.description).toContain(
      '결과가 정해지지 않은 지원은 운영진이 이어서 결과를 확정할 수 있습니다.',
    );
  });
});
