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

  it('보류 / 일괄 합격 / 일괄 불합격 버튼은 onBulkAction 으로 전달된다', async () => {
    const onBulkAction = vi.fn();
    render(
      <BulkActionBar
        selectedCount={2}
        onBulkAction={onBulkAction}
        onPromoteToInterview={() => {}}
        useInterview
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '보류' }));
    expect(onBulkAction).toHaveBeenLastCalledWith('ON_HOLD');

    await userEvent.click(screen.getByRole('button', { name: '일괄 합격' }));
    expect(onBulkAction).toHaveBeenLastCalledWith('ACCEPTED');

    await userEvent.click(screen.getByRole('button', { name: '일괄 불합격' }));
    expect(onBulkAction).toHaveBeenLastCalledWith('REJECTED');
  });

  it('면접 모집에서도 "일괄 합격" 버튼이 유지된다 (INTERVIEW_PENDING 일괄 합격 리그레션 가드)', () => {
    render(
      <BulkActionBar
        selectedCount={4}
        onBulkAction={() => {}}
        onPromoteToInterview={() => {}}
        useInterview
      />,
    );

    expect(screen.getByRole('button', { name: '일괄 합격' })).toBeInTheDocument();
  });

  it('"보류" 버튼은 useInterview 와 무관하게 노출된다', () => {
    const { rerender } = render(
      <BulkActionBar
        selectedCount={4}
        onBulkAction={() => {}}
        onPromoteToInterview={() => {}}
        useInterview
      />,
    );
    expect(screen.getByRole('button', { name: '보류' })).toBeInTheDocument();

    rerender(
      <BulkActionBar
        selectedCount={4}
        onBulkAction={() => {}}
        onPromoteToInterview={() => {}}
        useInterview={false}
      />,
    );
    expect(screen.getByRole('button', { name: '보류' })).toBeInTheDocument();
  });

  it('"서류 검토 중" 버튼이 더 이상 렌더되지 않는다', () => {
    render(
      <BulkActionBar
        selectedCount={4}
        onBulkAction={() => {}}
        onPromoteToInterview={() => {}}
        useInterview
      />,
    );

    expect(
      screen.queryByRole('button', { name: '서류 검토 중' }),
    ).not.toBeInTheDocument();
  });
  it('마감된 모집(finalizeOnly)에서는 최종 결과 액션만 남는다', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onBulkAction={vi.fn()}
        onPromoteToInterview={vi.fn()}
        useInterview
        finalizeOnly
      />,
    );

    expect(screen.getByRole('button', { name: '일괄 합격' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일괄 불합격' })).toBeInTheDocument();
    // 마감 후 409 가 될 액션은 버튼부터 사라진다.
    expect(screen.queryByRole('button', { name: '보류' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '면접 대상으로 선정' })).not.toBeInTheDocument();
  });

});
