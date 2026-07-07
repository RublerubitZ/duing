import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminClubSummary } from '@duing/types';
import { AdminClubDeleteDialog } from '../../../app/admin/clubs/_components/AdminClubDeleteDialog';

function makeClub(overrides: Partial<AdminClubSummary> = {}): AdminClubSummary {
  return {
    id: 1,
    name: '삭제 동아리',
    category: 'ACADEMIC',
    division: null,
    college: null,
    logoUrl: null,
    status: 'INACTIVE',
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

describe('AdminClubDeleteDialog', () => {
  it('동아리명이 일치하지 않으면 삭제 버튼이 비활성이다', () => {
    render(
      <AdminClubDeleteDialog
        club={makeClub()}
        isPending={false}
        errorMessage={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled();
  });

  it('동아리명을 정확히 입력하면 삭제 버튼이 활성화된다', () => {
    render(
      <AdminClubDeleteDialog
        club={makeClub({ name: '삭제 동아리' })}
        isPending={false}
        errorMessage={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('동아리명 입력 확인'), { target: { value: '삭제 동아리' } });
    expect(screen.getByRole('button', { name: '삭제' })).toBeEnabled();
  });

  it('삭제 확정 시 입력한 사유로 onConfirm 이 호출된다', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubDeleteDialog
        club={makeClub({ name: '삭제 동아리' })}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('동아리명 입력 확인'), { target: { value: '삭제 동아리' } });
    fireEvent.change(screen.getByLabelText('삭제 사유 (선택)'), { target: { value: '  활동 종료  ' } });
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onConfirm).toHaveBeenCalledWith('활동 종료');
  });

  it('사유 없이 삭제하면 onConfirm 이 undefined 로 호출된다', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubDeleteDialog
        club={makeClub({ name: '삭제 동아리' })}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('동아리명 입력 확인'), { target: { value: '삭제 동아리' } });
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('isPending 중에는 동아리명이 일치해도 삭제 버튼이 비활성이다', () => {
    render(
      <AdminClubDeleteDialog
        club={makeClub({ name: '삭제 동아리' })}
        isPending={true}
        errorMessage={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('동아리명 입력 확인'), { target: { value: '삭제 동아리' } });
    expect(screen.getByRole('button', { name: '처리 중…' })).toBeDisabled();
  });
});
