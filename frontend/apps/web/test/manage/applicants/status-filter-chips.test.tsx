import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StatusCounts } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantCounts';
import { StatusFilterChips } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/StatusFilterChips';

const counts: StatusCounts = {
  total: 5,
  SUBMITTED: 2,
  ON_HOLD: 1,
  INTERVIEW_PENDING: 1,
  ACCEPTED: 1,
  REJECTED: 0,
};

describe('상태 필터 칩', () => {
  it('운영진 라벨과 카운트를 접근 이름에 함께 담는다', () => {
    render(<StatusFilterChips value={undefined} onChange={vi.fn()} counts={counts} useInterview />);
    expect(screen.getByRole('button', { name: '전체 5명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원 완료 2명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보류 1명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '면접 대상 1명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '합격 1명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '불합격 0명' })).toBeInTheDocument();
  });

  it('면접을 쓰지 않는 모집은 면접 대상 칩을 감춘다', () => {
    render(
      <StatusFilterChips value={undefined} onChange={vi.fn()} counts={counts} useInterview={false} />,
    );
    expect(screen.queryByRole('button', { name: /면접 대상/ })).not.toBeInTheDocument();
  });

  it('단일 선택 — 선택된 칩만 aria-pressed 가 true 다', () => {
    render(<StatusFilterChips value="ON_HOLD" onChange={vi.fn()} counts={counts} useInterview />);
    expect(screen.getByRole('button', { name: '보류 1명' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '전체 5명' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '합격 1명' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('전체 칩은 상태 필터를 지운다', () => {
    const onChange = vi.fn();
    render(<StatusFilterChips value="ON_HOLD" onChange={onChange} counts={counts} useInterview />);
    fireEvent.click(screen.getByRole('button', { name: '전체 5명' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('상태 칩은 해당 상태로 필터한다', () => {
    const onChange = vi.fn();
    render(<StatusFilterChips value={undefined} onChange={onChange} counts={counts} useInterview />);
    fireEvent.click(screen.getByRole('button', { name: '합격 1명' }));
    expect(onChange).toHaveBeenCalledWith('ACCEPTED');
  });
});
