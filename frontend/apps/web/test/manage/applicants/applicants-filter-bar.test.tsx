import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ApplicantsFilters } from '@duing/types';
import type { StatusCounts } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantCounts';
import { ApplicantsFilterBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsFilterBar';

const counts: StatusCounts = {
  total: 5,
  SUBMITTED: 2,
  ON_HOLD: 1,
  INTERVIEW_PENDING: 1,
  ACCEPTED: 1,
  REJECTED: 0,
};

function renderBar(filters: ApplicantsFilters = {}) {
  const onChange = vi.fn();
  render(
    <ApplicantsFilterBar filters={filters} onChange={onChange} useInterview counts={counts} />,
  );
  return { onChange };
}

describe('지원자 필터 바', () => {
  it('검색과 상태 칩을 항상 노출한다', () => {
    renderBar();
    expect(screen.getByLabelText('지원자 검색')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원 완료 2명' })).toBeInTheDocument();
  });

  it('상태 칩을 누르면 status 필터만 바뀐다', () => {
    const { onChange } = renderBar({ college: 'IT_ENGINEERING' });
    fireEvent.click(screen.getByRole('button', { name: '보류 1명' }));
    expect(onChange).toHaveBeenCalledWith({ college: 'IT_ENGINEERING', status: 'ON_HOLD' });
  });

  it('필터 버튼은 단과대·기간 적용 개수를 접근 이름에 담는다', () => {
    renderBar({ college: 'IT_ENGINEERING', submittedFrom: '2026-05-01' });
    expect(screen.getByRole('button', { name: '필터 2개 적용됨' })).toBeInTheDocument();
  });

  it('적용된 보조 필터가 없으면 "필터" 로만 보인다', () => {
    renderBar({ status: 'ON_HOLD' });
    expect(screen.getByRole('button', { name: '필터' })).toBeInTheDocument();
  });

  it('필터 초기화는 한 벌만 렌더되고 모든 필터를 비운다', () => {
    const { onChange } = renderBar({ status: 'ON_HOLD', college: 'IT_ENGINEERING', q: '홍' });
    // 데스크탑·모바일 두 벌을 두면 jsdom 이 둘 다 잡아 getByRole 이 터진다 — 한 벌만 렌더한다.
    expect(screen.getAllByRole('button', { name: '필터 초기화' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('데스크탑 단과대 선택은 college 필터를 바꾼다', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('단과대'), { target: { value: 'IT_ENGINEERING' } });
    expect(onChange).toHaveBeenCalledWith({ college: 'IT_ENGINEERING' });
  });
});

describe('검색 디바운스', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('입력 후 디바운스가 지나야 q 로 커밋된다', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('지원자 검색'), { target: { value: '홍길동' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onChange).toHaveBeenCalledWith({ q: '홍길동' });
  });
});
