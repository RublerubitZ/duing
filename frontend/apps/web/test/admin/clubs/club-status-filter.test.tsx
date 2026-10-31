import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AdminClubStatusFilter } from '@/app/admin/clubs/_components/AdminClubStatusFilter';
import {
  STATUS_FILTER_LABEL,
  STATUS_FILTER_ORDER,
  statusFilterParams,
  type StatusFilter,
} from '@/app/admin/clubs/_lib/clubStatus';

describe('동아리 상태 필터 탭', () => {
  it('맨 끝에 미결 정리 필요 탭을 둔다', () => {
    expect(STATUS_FILTER_ORDER.map((filter) => STATUS_FILTER_LABEL[filter])).toEqual([
      '전체', '승인 대기', '운영 중', '운영 중단', '거절', '미결 정리 필요',
    ]);
  });

  it.each<[StatusFilter, ReturnType<typeof statusFilterParams>]>([
    ['ALL', {}],
    ['PENDING_APPROVAL', { status: 'PENDING_APPROVAL' }],
    ['INACTIVE', { status: 'INACTIVE' }],
    ['INACTIVE_PENDING', { status: 'INACTIVE', needsPendingCleanup: true }],
  ])('%s 탭은 조회 조건 %o 로 바뀐다 — INACTIVE_PENDING 은 서버 상태가 아니다', (filter, expected) => {
    expect(statusFilterParams(filter)).toEqual(expected);
  });

  it('6탭 알약은 줄바꿈 없이 묶음째 가로로 스크롤한다', () => {
    render(<AdminClubStatusFilter value="ALL" onChange={vi.fn()} />);
    const tablist = screen.getByRole('tablist', { name: '동아리 상태 필터' });
    expect(tablist).toHaveClass('inline-flex', 'w-max');
    expect(tablist).not.toHaveClass('flex-wrap');
    expect(tablist.parentElement).toHaveClass('max-w-full', 'overflow-x-auto');
  });

  it('미결 정리 필요 탭을 누르면 그 필터로 바꾼다', async () => {
    const onChange = vi.fn();
    render(<AdminClubStatusFilter value="ALL" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: '미결 정리 필요' }));
    expect(onChange).toHaveBeenCalledWith('INACTIVE_PENDING');
  });
});
