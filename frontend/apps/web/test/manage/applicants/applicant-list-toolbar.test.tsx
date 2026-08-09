import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SelectAllState } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantSelection';
import { ApplicantListToolbar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantListToolbar';

function renderToolbar(
  overrides: Partial<{
    totalCount: number;
    selectableCount: number;
    selectedCount: number;
    state: SelectAllState;
    useInterview: boolean;
    finalizeOnly: boolean;
  }> = {},
) {
  const onToggleAll = vi.fn();
  const onBulkAction = vi.fn();
  const onPromoteToInterview = vi.fn();
  render(
    <ApplicantListToolbar
      totalCount={overrides.totalCount ?? 9}
      selectableCount={overrides.selectableCount ?? 6}
      selectedCount={overrides.selectedCount ?? 0}
      state={overrides.state ?? 'none'}
      onToggleAll={onToggleAll}
      onBulkAction={onBulkAction}
      onPromoteToInterview={onPromoteToInterview}
      useInterview={overrides.useInterview ?? true}
      finalizeOnly={overrides.finalizeOnly ?? false}
    />,
  );
  return { onToggleAll, onBulkAction, onPromoteToInterview };
}

describe('지원자 목록 도구 모음 (데스크탑)', () => {
  it('선택 전에는 전체 선택과 총원만 보이고 액션은 숨는다', () => {
    renderToolbar();
    expect(screen.getByText('전체 선택')).toBeInTheDocument();
    expect(screen.getByText('총 9명')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '일괄 합격' })).not.toBeInTheDocument();
  });

  it('선택하면 선택 수와 일괄 액션이 나타난다', () => {
    renderToolbar({ selectedCount: 5, state: 'partial' });
    expect(screen.getByText('5명 선택됨')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '면접 대상으로 선정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보류' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일괄 불합격' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일괄 합격' })).toBeInTheDocument();
  });

  /* 표 헤더에 있던 케이스 3건을 여기로 옮겼다 — 전체 선택이 툴바로 이동했다. */
  it('누르면 onToggleAll 이 불린다', () => {
    const { onToggleAll } = renderToolbar();
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it('일부만 선택되면 indeterminate 다', () => {
    renderToolbar({ selectedCount: 2, state: 'partial' });
    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', { name: /전체 선택/ });
    expect(checkbox.indeterminate).toBe(true);
    expect(checkbox.checked).toBe(false);
  });

  it('선택 가능 인원이 없으면 비활성이다', () => {
    renderToolbar({ selectableCount: 0 });
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeDisabled();
  });

  it('전체 선택 상태면 checked 다', () => {
    renderToolbar({ selectedCount: 6, state: 'all' });
    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', { name: /전체 선택/ });
    expect(checkbox.checked).toBe(true);
    expect(checkbox.indeterminate).toBe(false);
  });

  /* WCAG 2.5.3 — 접근 이름이 가시 텍스트를 포함해야 음성 제어로 부를 수 있다. */
  it('선택 중에는 접근 이름이 가시 텍스트("N명 선택됨")를 포함한다', () => {
    renderToolbar({ selectedCount: 5, state: 'partial' });
    expect(screen.getByText('5명 선택됨')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: '전체 선택 (5명 선택됨)' }),
    ).toBeInTheDocument();
  });

  it('액션은 콜백으로 전달된다', () => {
    const { onBulkAction, onPromoteToInterview } = renderToolbar({ selectedCount: 3, state: 'partial' });
    fireEvent.click(screen.getByRole('button', { name: '일괄 합격' }));
    expect(onBulkAction).toHaveBeenCalledWith('ACCEPTED');
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    expect(onBulkAction).toHaveBeenCalledWith('ON_HOLD');
    fireEvent.click(screen.getByRole('button', { name: '면접 대상으로 선정' }));
    expect(onPromoteToInterview).toHaveBeenCalledTimes(1);
  });

  it('면접을 쓰지 않는 모집은 면접 대상 선정을 감춘다', () => {
    renderToolbar({ selectedCount: 3, state: 'partial', useInterview: false });
    expect(screen.queryByRole('button', { name: '면접 대상으로 선정' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보류' })).toBeInTheDocument();
  });

  /* 마감 모집은 되돌리는 액션이 사라지고 최종 확정만 남는다 — 하단 바와 같은 규칙이다. */
  it('마감된 모집은 되돌리는 액션을 감추고 최종 결과만 남긴다', () => {
    renderToolbar({ selectedCount: 3, state: 'partial', finalizeOnly: true });
    expect(screen.queryByRole('button', { name: '면접 대상으로 선정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보류' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일괄 합격' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일괄 불합격' })).toBeInTheDocument();
  });
});
