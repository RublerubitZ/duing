import { render, screen } from '@testing-library/react';
import { todayKstDateString } from '@duing/hooks/datetime';
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
    expect(screen.getByText('34명 지원 · 모집 인원 55명')).toBeInTheDocument();
  });

  it('applicantCount 가 null 이면 지원자 진행을 숨긴다', () => {
    render(<ClubRecruitmentSummary recruitment={{ ...base, applicantCount: null }} />);
    expect(screen.queryByText('현재 지원자')).toBeNull();
  });

  it('마감 당일 → 헤더가 "모집중 · D-day" ("D-0" 표기 금지)', () => {
    render(<ClubRecruitmentSummary recruitment={{ ...base, endDate: todayKstDateString(new Date()) }} />);
    expect(screen.getByText('모집중 · D-day')).toBeInTheDocument();
  });

  it('CLOSED → 헤더가 "모집마감"', () => {
    render(<ClubRecruitmentSummary recruitment={{ ...base, displayStatus: 'CLOSED' }} />);
    expect(screen.getByText('모집마감')).toBeInTheDocument();
  });

  // 면접을 끄면 폼은 면접 기간을 비워 보내지만 서버가 그대로 둔다 — '(서류)' 와 면접 줄이 함께 보이면 안 된다.
  it('면접을 끈 모집은 면접 기간이 남아 있어도 면접 줄을 숨기고 인원은 (서류)', () => {
    render(<ClubRecruitmentSummary recruitment={{ ...base, useInterview: false }} />);
    expect(screen.getByText('55명 (서류)')).toBeInTheDocument();
    expect(screen.queryByText('면접')).toBeNull();
    expect(screen.queryByText('2026-06-15 ~ 2026-06-28')).toBeNull();
  });

  it('면접을 쓰는 모집이어도 면접 기간이 비어 있으면 면접 줄을 그리지 않는다', () => {
    render(
      <ClubRecruitmentSummary
        recruitment={{ ...base, interviewStartDate: null, interviewEndDate: null }}
      />,
    );
    expect(screen.getByText('55명 (서류 + 면접)')).toBeInTheDocument();
    expect(screen.queryByText('면접')).toBeNull();
  });

  it('모집이 없으면 렌더하지 않는다', () => {
    const { container } = render(<ClubRecruitmentSummary recruitment={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
