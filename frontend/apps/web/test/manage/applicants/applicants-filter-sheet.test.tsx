import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ApplicantsFilters } from '@duing/types';
import { ApplicantsFilterSheet } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsFilterSheet';

const { skipNextOverlayReclaim } = vi.hoisted(() => ({ skipNextOverlayReclaim: vi.fn() }));

// Sheet 가 같은 모듈의 useBackDismiss 를 쓰므로 부분 목킹한다 — 전체를 갈아치우면 시트가 못 뜬다.
vi.mock('@/app/_lib/backDismiss', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/_lib/backDismiss')>()),
  skipNextOverlayReclaim,
}));

function renderSheet(filters: ApplicantsFilters = {}) {
  const onApply = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ApplicantsFilterSheet
      open
      onOpenChange={onOpenChange}
      filters={filters}
      onApply={onApply}
    />,
  );
  return { onApply, onOpenChange };
}

describe('지원자 보조 필터 시트', () => {
  beforeEach(() => {
    skipNextOverlayReclaim.mockReset();
  });

  it('단과대·기간만 담고 상태는 중복해 넣지 않는다', () => {
    renderSheet();
    expect(screen.getByLabelText('단과대')).toBeInTheDocument();
    expect(screen.getByLabelText('시작일')).toBeInTheDocument();
    expect(screen.getByLabelText('종료일')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '상태 필터' })).not.toBeInTheDocument();
  });

  it('적용을 눌러야 초안이 반영된다 — 선택 즉시 반영하지 않는다', () => {
    const { onApply } = renderSheet();

    fireEvent.change(screen.getByLabelText('단과대'), { target: { value: 'IT_ENGINEERING' } });
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onApply).toHaveBeenCalledWith({ college: 'IT_ENGINEERING' });
  });

  /*
   * 실브라우저에서 잡은 회귀. 시트 닫힘의 회수 back() 이 방금 적용한 필터 URL(router.replace)을
   * 되돌려 삼켜, 필터가 통째로 무효가 됐다. 닫기 직전에 회수 1회를 건너뛰어야 한다.
   * jsdom 은 history 회수를 재현하지 못하므로 호출 자체를 가드한다.
   */
  it('적용은 오버레이 회수를 건너뛴 뒤 닫는다 — 닫힘이 필터 이동을 삼키지 않도록', () => {
    const order: string[] = [];
    skipNextOverlayReclaim.mockImplementation(() => {
      order.push('skip');
    });
    render(
      <ApplicantsFilterSheet
        open
        onOpenChange={() => order.push('close')}
        filters={{}}
        onApply={() => order.push('apply')}
      />,
    );

    fireEvent.change(screen.getByLabelText('단과대'), { target: { value: 'IT_ENGINEERING' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(skipNextOverlayReclaim).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['skip', 'apply', 'close']);
  });

  it('보조 필터 지우기는 단과대·기간만 비우고 상태·검색어는 건드리지 않는다', () => {
    const { onApply } = renderSheet({
      status: 'ON_HOLD',
      q: '홍',
      college: 'IT_ENGINEERING',
      submittedFrom: '2026-05-01',
    });

    fireEvent.click(screen.getByRole('button', { name: '보조 필터 지우기' }));
    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(onApply).toHaveBeenCalledWith({
      status: 'ON_HOLD',
      q: '홍',
      college: undefined,
      submittedFrom: undefined,
      submittedTo: undefined,
    });
  });
});
