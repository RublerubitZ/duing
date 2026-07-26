import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AdminUserSearchResult } from '@duing/types';

import { AdminUsersTable } from '@/app/admin/users/_components/AdminUsersTable';
import { AdminUserStatusFilter } from '@/app/admin/users/_components/AdminUserStatusFilter';
import { UserStatusBadge } from '@/app/admin/users/_components/UserStatusBadge';

const baseUser: AdminUserSearchResult = {
  id: 1,
  studentId: '2021118033',
  name: '김도윤',
  role: 'STUDENT',
  grade: 'JUNIOR',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학',
  status: 'ACTIVE',
};

describe('회원 상태 뱃지', () => {
  it('정상 계정은 "정상"으로 표시한다', () => {
    render(<UserStatusBadge status="ACTIVE" />);
    expect(screen.getByText('정상')).toBeInTheDocument();
  });

  it('정지 계정은 "이용 정지"로 표시한다', () => {
    render(<UserStatusBadge status="SUSPENDED" />);
    expect(screen.getByText('이용 정지')).toBeInTheDocument();
  });

  it('상태 값이 없으면 아무것도 렌더하지 않는다 — 구 백엔드 응답에서 전원이 정지로 보이면 안 된다', () => {
    const { container } = render(<UserStatusBadge status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('회원 목록 표', () => {
  it('행의 상세 버튼을 누르면 해당 회원으로 콜백이 호출된다', async () => {
    const user = userEvent.setup();
    const onOpenDetail = vi.fn();
    render(
      <AdminUsersTable items={[baseUser]} onOpenDetail={onOpenDetail} onForceLogout={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: '김도윤 상세' }));
    expect(onOpenDetail).toHaveBeenCalledWith(baseUser);
  });

  it('행 액션 버튼의 접근명에 회원 이름이 들어간다 — 행마다 같은 이름이면 어느 회원인지 알 수 없다', () => {
    render(
      <AdminUsersTable
        items={[baseUser, { ...baseUser, id: 2, studentId: '2022118044', name: '이서연' }]}
        onOpenDetail={vi.fn()}
        onForceLogout={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')),
    ).toEqual(['김도윤 상세', '김도윤 강제 로그아웃', '이서연 상세', '이서연 강제 로그아웃']);
    // 화면에 보이는 글자는 그대로 짧게 둔다.
    expect(screen.getAllByText('상세')).toHaveLength(2);
  });

  it('정지 회원 행은 마우스를 올려도 코랄 강조를 유지한다', () => {
    render(
      <AdminUsersTable
        items={[{ ...baseUser, status: 'SUSPENDED' }]}
        onOpenDetail={vi.fn()}
        onForceLogout={vi.fn()}
      />,
    );

    const suspendedRow = screen.getByRole('row', { name: /김도윤/ });
    expect(suspendedRow.className).toContain('bg-coral/[0.04]');
    // 공통 hover:bg-graysoft 가 남으면 특이성으로 이겨 hover 중에만 강조가 사라진다.
    expect(suspendedRow.className).toContain('hover:bg-coral/[0.08]');
    expect(suspendedRow.className).not.toContain('hover:bg-graysoft');
  });

  it('휴대폰 번호는 목록에 노출하지 않는다', () => {
    render(<AdminUsersTable items={[baseUser]} onOpenDetail={vi.fn()} onForceLogout={vi.fn()} />);
    expect(screen.queryByText(/010-/)).not.toBeInTheDocument();
    // 컬럼 자체를 고정한다 — 휴대폰 컬럼이 끼어들면 여기서 걸린다.
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '회원',
      '역할',
      '상태',
      '조치',
    ]);
  });
});

describe('계정 상태 필터', () => {
  it('선택된 필터만 눌린 상태로 노출한다', () => {
    const { rerender } = render(<AdminUserStatusFilter value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('전체');

    rerender(<AdminUserStatusFilter value="SUSPENDED" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('이용 정지');
  });
});
