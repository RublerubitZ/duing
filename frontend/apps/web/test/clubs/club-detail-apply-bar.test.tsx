import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudentRecruitmentProjection } from '@duing/types';
import { ClubDetailApplyBar } from '../../app/clubs/[clubId]/_components/ClubDetailApplyBar';

vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'unauthenticated' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const base: StudentRecruitmentProjection = {
  id: 1,
  title: 'X',
  startDate: '2026-05-01',
  endDate: '2099-12-31',
  displayStatus: 'OPEN',
  capacity: 20,
  useInterview: false,
  targetRole: 'MEMBER',
  applicationMode: 'SELF',
  externalFormUrl: null,
  interviewStartDate: null,
  interviewEndDate: null,
  applicantCount: null,
};

describe('ClubDetailApplyBar — 모바일 하단 지원 바', () => {
  it('OPEN(마감일 있음) → 상단 D-day, 강조 "N명 모집중", 활성 지원 버튼', () => {
    render(<ClubDetailApplyBar recruitment={base} />);
    expect(screen.getByText(/^모집중 · D-\d+$/)).toBeInTheDocument();
    expect(screen.getByText('20명 모집중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).not.toBeDisabled();
  });

  it('상시모집 → 상단 "상시모집", 활성 지원 버튼', () => {
    render(<ClubDetailApplyBar recruitment={{ ...base, displayStatus: 'ALWAYS_OPEN', endDate: null }} />);
    expect(screen.getByText('상시모집')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).not.toBeDisabled();
  });

  it('CLOSED → 종료 문구 + 비활성 지원 버튼', () => {
    render(<ClubDetailApplyBar recruitment={{ ...base, displayStatus: 'CLOSED' }} />);
    expect(screen.getByText('모집 마감')).toBeInTheDocument();
    expect(screen.getByText('이번 모집은 종료됐어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
  });

  it('모집 없음 → 안내 문구 + 비활성 지원 버튼', () => {
    render(<ClubDetailApplyBar recruitment={undefined} />);
    expect(screen.getByText('현재 모집이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
  });

  it('EXTERNAL 모집 → 버튼 라벨 "외부 폼으로 이동"', () => {
    render(<ClubDetailApplyBar recruitment={{ ...base, applicationMode: 'EXTERNAL', externalFormUrl: 'https://x' }} />);
    expect(screen.getByRole('button', { name: '외부 폼으로 이동' })).toBeInTheDocument();
  });
});
