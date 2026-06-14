import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StudentRecruitmentProjection } from '@duing/types';
import { ClubRecruitmentSummary } from '../../app/clubs/[clubId]/_components/ClubRecruitmentSummary';

const base: StudentRecruitmentProjection = {
  id: 1,
  title: '10기 모집',
  startDate: '2026-06-15',
  endDate: '2099-12-31',
  displayStatus: 'OPEN',
  capacity: 55,
  useInterview: true,
  targetRole: 'MEMBER',
  applicationMode: 'SELF',
  externalFormUrl: null,
  interviewStartDate: '2026-06-15',
  interviewEndDate: '2026-06-28',
  applicantCount: 34,
};

describe('ClubRecruitmentSummary — 모바일 모집 요약 카드', () => {
  it('OPEN(마감일 있음) → 헤더에 D-day, 인원/면접 정보 노출', () => {
    render(<ClubRecruitmentSummary recruitment={base} />);
    expect(screen.getByText(/^모집중 · D-\d+$/)).toBeInTheDocument();
    expect(screen.getByText('55명 (서류 + 면접)')).toBeInTheDocument();
    expect(screen.getByText('2026-06-15 ~ 2026-06-28')).toBeInTheDocument();
  });

  it('applicantCount 가 있으면 지원자 진행 표시', () => {
    render(<ClubRecruitmentSummary recruitment={base} />);
    expect(screen.getByText('현재 지원자')).toBeInTheDocument();
    expect(screen.getByText('34 / 55명')).toBeInTheDocument();
  });

  it('applicantCount 가 null 이면 지원자 진행을 숨긴다', () => {
    render(<ClubRecruitmentSummary recruitment={{ ...base, applicantCount: null }} />);
    expect(screen.queryByText('현재 지원자')).toBeNull();
  });

  it('CLOSED → 헤더가 "모집마감"', () => {
    render(<ClubRecruitmentSummary recruitment={{ ...base, displayStatus: 'CLOSED' }} />);
    expect(screen.getByText('모집마감')).toBeInTheDocument();
  });

  it('모집이 없으면 렌더하지 않는다', () => {
    const { container } = render(<ClubRecruitmentSummary recruitment={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
