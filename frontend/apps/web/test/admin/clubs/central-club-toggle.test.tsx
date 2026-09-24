import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminClubCentralClubToggleDialog } from '../../../app/admin/clubs/_components/AdminClubCentralClubToggleDialog';

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminClubCentralClubToggleDialog', () => {
  it('확인 버튼 클릭 → onConfirm 호출', () => {
    const onConfirm = vi.fn();
    render(
      <AdminClubCentralClubToggleDialog
        clubName="X"
        currentValue={false}
        isPending={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clubName === null 일 때 렌더 자체가 없음', () => {
    const { container } = render(
      <AdminClubCentralClubToggleDialog
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

  it('처리 실패 문구는 role="alert" 로 노출되어 스크린리더가 읽는다', () => {
    render(
      <AdminClubCentralClubToggleDialog
        clubName="X"
        currentValue={false}
        isPending={false}
        errorMessage="변경에 실패했습니다."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('변경에 실패했습니다.');
  });
});
