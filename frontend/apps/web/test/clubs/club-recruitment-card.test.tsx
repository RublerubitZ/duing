import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudentRecruitmentProjection } from '@duing/types';
import { ClubRecruitmentCard } from '../../app/clubs/[clubId]/_components/ClubRecruitmentCard';

vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'unauthenticated' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../app/_components/FavoriteToggleButton', () => ({
  FavoriteToggleButton: () => <button>찜하기</button>,
}));

const base: StudentRecruitmentProjection = {
  id: 1,
  title: 'X',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  displayStatus: 'OPEN',
  capacity: 10,
  useInterview: false,
  targetRole: 'MEMBER',
  applicationMode: 'SELF',
  externalFormUrl: null,
  interviewStartDate: null,
  interviewEndDate: null,
  applicantCount: null,
};

describe('ClubRecruitmentCard', () => {
  it('모집 없음이면 비활성 지원 버튼과 안내 문구', () => {
    render(<ClubRecruitmentCard recruitment={undefined} clubId={7} />);
    expect(screen.getByText('모집 없음')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '지원하기' });
    expect(button).toBeDisabled();
  });

  it('상시모집이면 헤더에 "상시모집"이 노출되고 지원 버튼이 활성화된다', () => {
    render(
      <ClubRecruitmentCard
        recruitment={{ ...base, displayStatus: 'ALWAYS_OPEN', endDate: null }}
        clubId={7}
      />,
    );
    expect(screen.getAllByText('상시모집').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '지원하기' })).not.toBeDisabled();
  });

  it('CLOSED 면 지원 버튼이 비활성화된다', () => {
    render(
      <ClubRecruitmentCard
        recruitment={{ ...base, displayStatus: 'CLOSED' }}
        clubId={7}
      />,
    );
    expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
  });

  it('EXTERNAL 모집이면 버튼 라벨이 "외부 폼으로 이동"', () => {
    render(
      <ClubRecruitmentCard
        recruitment={{ ...base, applicationMode: 'EXTERNAL', externalFormUrl: 'https://x' }}
        clubId={7}
      />,
    );
    expect(screen.getByRole('button', { name: '외부 폼으로 이동' })).toBeInTheDocument();
  });
});
