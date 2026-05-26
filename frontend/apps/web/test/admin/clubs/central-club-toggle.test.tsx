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
});
