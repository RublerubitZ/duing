import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  describe('주소로 도착한 선택 탭 가로 스크롤', () => {
    afterEach(() => vi.restoreAllMocks());

    // jsdom 에는 레이아웃이 없다 — 감싸개는 왼쪽 여백 16px, 선택 탭은 감싸개 안 315px 에서 98px 폭으로 놓인 배치를 준다.
    function mockLayout(scrollerClientWidth: number) {
      vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function offsetLeft(this: HTMLElement) {
        return this.getAttribute('aria-selected') === 'true' ? 16 + 315 : 16;
      });
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function offsetWidth(this: HTMLElement) {
        return this.getAttribute('aria-selected') === 'true' ? 98 : 0;
      });
      vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function clientWidth(this: Element) {
        return this.classList.contains('overflow-x-auto') ? scrollerClientWidth : 0;
      });
    }

    it.each([
      // 390 폭: 감싸개 358px 안에 탭 오른쪽 끝(413px)이 넘친다 → 넘친 55px + 끝 여유 16px 만큼 가로로만 당긴다
      ['390 폭', 358, 71],
      // PC: 넘침이 없어 그대로 둔다
      ['PC', 1200, 0],
    ])('%s 에서 처음 그릴 때 감싸개 scrollLeft 를 %d 폭 기준 %d 로 맞춘다', (_label, scrollerClientWidth, expectedScrollLeft) => {
      mockLayout(scrollerClientWidth);
      render(<AdminClubStatusFilter value="INACTIVE_PENDING" onChange={vi.fn()} />);
      const scroller = screen.getByRole('tablist', { name: '동아리 상태 필터' }).parentElement;
      expect(scroller?.scrollLeft).toBe(expectedScrollLeft);
    });
  });

  it('미결 정리 필요 탭을 누르면 그 필터로 바꾼다', async () => {
    const onChange = vi.fn();
    render(<AdminClubStatusFilter value="ALL" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: '미결 정리 필요' }));
    expect(onChange).toHaveBeenCalledWith('INACTIVE_PENDING');
  });
});
