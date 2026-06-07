import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApplicantNavBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantNavBar';

let mockNeighborsData: () => { prevApplicationId: number | null; nextApplicationId: number | null };

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@duing/hooks', () => ({
  useApplicantNeighborsQuery: (_rId: number, _aId: number, _filters: unknown) => ({
    data: mockNeighborsData(),
  }),
}));

describe('ApplicantNavBar', () => {
  it('prevApplicationId 가 null 이면 이전 버튼이 disabled 이다', () => {
    mockNeighborsData = () => ({ prevApplicationId: null, nextApplicationId: 2 });
    render(
      <ApplicantNavBar
        clubId={1}
        recruitmentId={1}
        applicationId={1}
        filters={{}}
        currentStatus="SUBMITTED"
      />,
    );
    expect(screen.getByRole('button', { name: '‹ 이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 ›' })).not.toBeDisabled();
  });

  it('nextApplicationId 가 null 이면 다음 버튼이 disabled 이다', () => {
    mockNeighborsData = () => ({ prevApplicationId: 5, nextApplicationId: null });
    render(
      <ApplicantNavBar
        clubId={1}
        recruitmentId={1}
        applicationId={3}
        filters={{}}
        currentStatus="UNDER_REVIEW"
      />,
    );
    expect(screen.getByRole('button', { name: '‹ 이전' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 ›' })).toBeDisabled();
  });

  it('필터 search params 가 목록 링크의 href 에 포함된다', () => {
    mockNeighborsData = () => ({ prevApplicationId: null, nextApplicationId: null });
    render(
      <ApplicantNavBar
        clubId={1}
        recruitmentId={2}
        applicationId={3}
        filters={{ status: 'UNDER_REVIEW', q: '홍길동' }}
        currentStatus="UNDER_REVIEW"
      />,
    );
    const listLink = screen.getByRole('link', { name: '← 목록' });
    expect(listLink).toHaveAttribute('href', expect.stringContaining('status=UNDER_REVIEW'));
    expect(listLink).toHaveAttribute('href', expect.stringContaining('q='));
  });

  it('현재 상태 뱃지가 표시된다', () => {
    mockNeighborsData = () => ({ prevApplicationId: null, nextApplicationId: null });
    render(
      <ApplicantNavBar
        clubId={1}
        recruitmentId={1}
        applicationId={1}
        filters={{}}
        currentStatus="INTERVIEW_PENDING"
      />,
    );
    expect(screen.getByText('면접 대기')).toBeInTheDocument();
  });
});
