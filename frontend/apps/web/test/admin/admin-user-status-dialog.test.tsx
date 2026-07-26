import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AdminUserDetail } from '@duing/types';

import { AdminUserStatusDialog } from '@/app/admin/users/_components/AdminUserStatusDialog';

// `as` 단언 대신 전체 객체로 만든다(레포 규칙) — 회장 경고를 보려면 clubs 가 실제로 채워져 있어야 한다.
const detail: AdminUserDetail = {
  id: 12,
  name: '정우진',
  studentId: '2023118902',
  grade: 'SOPHOMORE',
  college: 'IT_ENGINEERING',
  major: '전자공학과',
  role: 'STUDENT',
  maskedPhone: '010-****-9983',
  phoneVerified: true,
  phoneVerifiedAt: '2024-03-04T01:00:00Z',
  status: 'ACTIVE',
  createdAt: '2024-03-04T01:00:00Z',
  lastLoginAt: null,
  adminNote: null,
  adminNoteUpdatedAt: null,
  adminNoteUpdatedBy: null,
  clubs: [{ clubId: 3, clubName: '두잉코드', role: 'LEADER', joinedAt: '2023-03-02T01:00:00Z' }],
  recentActions: [],
};

const props = {
  detail,
  nextStatus: 'SUSPENDED',
  isPending: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
} satisfies React.ComponentProps<typeof AdminUserStatusDialog>;

describe('계정 상태 변경 확인 다이얼로그', () => {
  it('사유가 비어 있으면 확인 버튼을 누를 수 없다', () => {
    render(<AdminUserStatusDialog {...props} />);
    expect(screen.getByRole('button', { name: '계정 정지' })).toBeDisabled();
  });

  it('사유를 입력하면 확인 버튼이 활성화되고 사유와 함께 확정된다', () => {
    const onConfirm = vi.fn();
    render(<AdminUserStatusDialog {...props} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText('정지 사유'), {
      target: { value: '커뮤니티 신고 3건 누적' },
    });
    fireEvent.click(screen.getByRole('button', { name: '계정 정지' }));

    expect(onConfirm).toHaveBeenCalledWith('커뮤니티 신고 3건 누적');
  });

  it('공백만 입력한 사유는 확정할 수 없다 — 서버가 전각 공백까지 거부한다', () => {
    const onConfirm = vi.fn();
    render(<AdminUserStatusDialog {...props} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText('정지 사유'), { target: { value: '　 　' } });

    expect(screen.getByRole('button', { name: '계정 정지' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('사유는 서버와 같은 단위(UTF-16 코드유닛)로 200자에서 막는다', () => {
    render(<AdminUserStatusDialog {...props} />);
    expect(screen.getByLabelText('정지 사유')).toHaveAttribute('maxlength', '200');
  });

  it('대상이 동아리 회장이면 경고를 표시하되 정지를 막지는 않는다', () => {
    render(<AdminUserStatusDialog {...props} />);
    expect(screen.getByText(/두잉코드 동아리의 회장/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계정 정지' })).toBeInTheDocument();
  });

  it('회장이 아닌 회원에게는 회장 경고를 띄우지 않는다', () => {
    render(
      <AdminUserStatusDialog
        {...props}
        detail={{
          ...detail,
          clubs: [{ clubId: 3, clubName: '두잉코드', role: 'MEMBER', joinedAt: '2023-03-02T01:00:00Z' }],
        }}
      />,
    );
    expect(screen.queryByText(/동아리의 회장/)).not.toBeInTheDocument();
  });

  it('사유는 감사 로그에 기록된다고 안내한다 — 관리자 메모에 남는다고 오해시키지 않는다', () => {
    render(<AdminUserStatusDialog {...props} />);
    expect(screen.getByText(/감사 로그에 기록됩니다/)).toBeInTheDocument();
    expect(screen.queryByText(/관리자 메모에 기록/)).not.toBeInTheDocument();
  });

  it('해제할 때도 사유를 필수로 받는다', () => {
    render(
      <AdminUserStatusDialog
        {...props}
        detail={{ ...detail, status: 'SUSPENDED' }}
        nextStatus="ACTIVE"
      />,
    );
    expect(screen.getByLabelText('정지 해제 사유')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정지 해제' })).toBeDisabled();
  });

  it('해제 다이얼로그에는 회장 경고를 띄우지 않는다 — 해제는 동아리 운영을 되돌리는 쪽이다', () => {
    render(
      <AdminUserStatusDialog
        {...props}
        detail={{ ...detail, status: 'SUSPENDED' }}
        nextStatus="ACTIVE"
      />,
    );
    expect(screen.queryByText(/동아리의 회장/)).not.toBeInTheDocument();
  });
});
