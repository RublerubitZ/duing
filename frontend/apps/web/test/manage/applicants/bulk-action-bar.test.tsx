import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BulkActionBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/BulkActionBar';

describe('BulkActionBar', () => {
  it('선택 0건이면 아무것도 렌더되지 않는다', () => {
    const { container } = render(
      <BulkActionBar
        selectedCount={0}
        onBulkAction={() => {}}
        onPromoteToInterview={() => {}}
        useInterview
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('useInterview=true 면 "면접 대상으로 선정" 버튼이 노출된다', () => {
    render(
      <BulkActionBar
        selectedCount={3}
        onBulkAction={() => {}}
        onPromoteToInterview={() => {}}
        useInterview
      />,
    );

    expect(
      screen.getByRole('button', { name: '면접 대상으로 선정' }),
    ).toBeInTheDocument();
  });

  it('useInterview=false 면 "면접 대상으로 선정" 버튼이 노출되지 않는다', () => {
    render(
      <BulkActionBar
        selectedCount={3}
        onBulkAction={() => {}}
        onPromoteToInterview={() => {}}
        useInterview={false}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '면접 대상으로 선정' }),
    ).not.toBeInTheDocument();
  });

  it('"면접 대상으로 선정" 버튼 클릭 시 onPromoteToInterview 가 호출된다 (onBulkAction 미호출)', async () => {
    const onBulkAction = vi.fn();
    const onPromoteToInterview = vi.fn();
    render(
      <BulkActionBar
        selectedCount={2}
        onBulkAction={onBulkAction}
        onPromoteToInterview={onPromoteToInterview}
        useInterview
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: '면접 대상으로 선정' }),
    );

    expect(onPromoteToInterview).toHaveBeenCalledTimes(1);
    expect(onBulkAction).not.toHaveBeenCalled();
  });

  it('서류 검토 중 / 일괄 합격 / 일괄 불합격 버튼은 onBulkAction 으로 전달된다', async () => {
    const onBulkAction = vi.fn();
    render(
      <BulkActionBar
        selectedCount={2}
        onBulkAction={onBulkAction}
        onPromoteToInterview={() => {}}
        useInterview
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '서류 검토 중' }));
    expect(onBulkAction).toHaveBeenLastCalledWith('UNDER_REVIEW');

    await userEvent.click(screen.getByRole('button', { name: '일괄 합격' }));
    expect(onBulkAction).toHaveBeenLastCalledWith('ACCEPTED');

    await userEvent.click(screen.getByRole('button', { name: '일괄 불합격' }));
    expect(onBulkAction).toHaveBeenLastCalledWith('REJECTED');
  });
});
