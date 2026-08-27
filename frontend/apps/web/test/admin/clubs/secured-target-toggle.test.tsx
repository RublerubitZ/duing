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
    // 시간은 고정 저장이 아니라 크롤 실범위를 그대로 쓴다는 안내(수정 5).
    expect(screen.getByText(/시간은 크롤 실범위 그대로/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('해제 방향은 차단 유지 안내를 보여준다', () => {
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
    expect(screen.getByText(/차단은 유지/)).toBeInTheDocument();
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
