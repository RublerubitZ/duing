import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AdminUserSearchResult } from '@duing/types';

import { AdminUsersTable } from '@/app/admin/users/_components/AdminUsersTable';
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

    await user.click(screen.getByRole('button', { name: '상세' }));
    expect(onOpenDetail).toHaveBeenCalledWith(baseUser);
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
