import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminClubSecuredTargetToggleDialog } from '../../../app/admin/clubs/_components/AdminClubSecuredTargetToggleDialog';

describe('AdminClubSecuredTargetToggleDialog', () => {
  it('지정 방향 문구와 확인 버튼 클릭 → onConfirm 호출', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubSecuredTargetToggleDialog
        clubName="고정관념"
        currentValue={false}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('기본 확보 시간 대상 지정')).toBeInTheDocument();
    // 확보 시간 비차단 전환(2026-08-27): 지정 = 해당 시간대 예약 차단 해제(다른 동아리 신청 가능) 안내.
    expect(screen.getByText(/예약 차단이 해제됩니다\(다른 동아리 신청 가능\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('해제 방향은 재차단 안내를 보여준다', () => {
    render(
      <AdminClubSecuredTargetToggleDialog
        clubName="고정관념"
        currentValue={true}
        isPending={false}
        errorMessage={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('기본 확보 시간 대상 해제')).toBeInTheDocument();
    // 해제 = 일반 크롤 예약 복귀·해당 시간대 재차단 안내.
    expect(screen.getByText(/다시 차단됩니다/)).toBeInTheDocument();
  });

  it('clubName === null 일 때 렌더 자체가 없음', () => {
    const { container } = render(
      <AdminClubSecuredTargetToggleDialog
        clubName={null}
        currentValue={false}
        isPending={false}
        errorMessage={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
