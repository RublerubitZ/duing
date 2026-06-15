import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ApplicantInterviewScheduleCard } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantInterviewScheduleCard';

import type { AvailabilityItem, InterviewRoundBrief } from '@duing/types';

// ── 픽스처 ────────────────────────────────────────────────────────────────

const slotA: AvailabilityItem = {
  slotId: 1,
  startTime: '2026-06-13T18:00:00',
  endTime: '2026-06-13T18:30:00',
};
const slotB: AvailabilityItem = {
  slotId: 2,
  startTime: '2026-06-13T18:30:00',
  endTime: '2026-06-13T19:00:00',
};

const baseRound: InterviewRoundBrief = {
  roundId: 10,
  title: '1차 면접',
  roundStatus: 'COLLECTING',
  memberStatus: 'INVITED',
  unresponded: false,
  alternativeAvailabilityText: null,
};

// 기본 props — 라운드 있음
const defaultProps = {
  interviewRound: baseRound,
  interviewAvailabilities: [slotA, slotB],
  assignedSlot: null,
  clubId: 1,
  recruitmentId: 2,
  applicationStatus: 'INTERVIEW_PENDING' as const,
};

// ── 테스트 ─────────────────────────────────────────────────────────────────

describe('ApplicantInterviewScheduleCard — 라운드 있음', () => {
  it('라운드 제목과 단계 칩(응답 수집 중)이 렌더된다', () => {
    render(<ApplicantInterviewScheduleCard {...defaultProps} />);

    expect(screen.getByText('1차 면접')).toBeInTheDocument();
    expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
  });

  it('[면접 관리에서 조정 →] 링크가 올바른 roundId 경로로 연결된다', () => {
    render(<ApplicantInterviewScheduleCard {...defaultProps} />);

    const link = screen.getByRole('link', { name: '면접 관리에서 조정' });
    expect(link).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/2/interview/rounds/10',
    );
  });

  it('memberStatus=INVITED + unresponded=false → "응답 대기" 노출', () => {
    render(<ApplicantInterviewScheduleCard {...defaultProps} />);

    expect(screen.getByText('응답 대기')).toBeInTheDocument();
  });

  it('memberStatus=INVITED + unresponded=true → rose 배경의 "미응답" 노출', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={{ ...baseRound, unresponded: true }}
      />,
    );

    const badge = screen.getByText('미응답');
    expect(badge).toBeInTheDocument();
    // rose 배경 클래스 확인
    expect(badge.className).toMatch(/rose/);
  });

  it('memberStatus=NO_AVAILABLE_SLOT → "가능한 시간 없음" + 사유 인용 박스 노출', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={{
          ...baseRound,
          memberStatus: 'NO_AVAILABLE_SLOT',
          alternativeAvailabilityText: '오전에는 수업이 있어서 어렵습니다',
        }}
      />,
    );

    expect(screen.getByText('가능한 시간 없음')).toBeInTheDocument();
    expect(screen.getByText('오전에는 수업이 있어서 어렵습니다')).toBeInTheDocument();
  });

  it('배정 슬롯이 availability 안에 포함되면 해당 row 에 "현재 배정" 배지가 표시된다', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={{ ...baseRound, memberStatus: 'ASSIGNED' }}
        assignedSlot={slotA}
      />,
    );

    const list = screen.getByRole('list', { name: '지원자가 선택한 면접 가능 시간' });
    const items = within(list).getAllByRole('listitem');

    const assignedRow = items.find((row) => row.textContent?.includes('6/13') && row.textContent?.includes('18:00'));
    expect(assignedRow).toBeDefined();
    expect(assignedRow).toHaveTextContent('현재 배정');
  });

  it('수동 배정 변경 버튼이 존재하지 않는다', () => {
    render(<ApplicantInterviewScheduleCard {...defaultProps} />);

    expect(screen.queryByRole('button', { name: '수동 배정 변경' })).not.toBeInTheDocument();
  });
});

describe('ApplicantInterviewScheduleCard — 라운드 null', () => {
  it('INTERVIEW_PENDING → 대기열 안내 문구와 [면접 관리] 링크가 노출된다', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={null}
        applicationStatus="INTERVIEW_PENDING"
      />,
    );

    expect(
      screen.getByText(/면접 대기열에 있음 — 다음 라운드 선정을 기다립니다/),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '면접 관리' });
    expect(link).toHaveAttribute('href', '/manage/clubs/1/recruitments/2/interview');
  });

  it('UNDER_REVIEW → 선정 전 안내 문구가 노출된다', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={null}
        applicationStatus="UNDER_REVIEW"
      />,
    );

    expect(
      screen.getByText(/면접 대상 선정 전 — 면접 관리의 라운드 만들기에서 선정합니다/),
    ).toBeInTheDocument();
  });

  it('PromoteToInterviewPendingDialog 가 렌더되지 않는다', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={null}
        applicationStatus="UNDER_REVIEW"
      />,
    );

    // promote dialog 는 철거됐으므로 관련 텍스트가 없어야 한다
    expect(screen.queryByText(/이 지원자는 아직 면접 대상이 아닙니다/)).not.toBeInTheDocument();
  });

  it('라운드 null + 터미널(ACCEPTED) → 아무것도 렌더되지 않는다', () => {
    const { container } = render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={null}
        applicationStatus="ACCEPTED"
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('라운드 null + 터미널(REJECTED) → 아무것도 렌더되지 않는다', () => {
    const { container } = render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={null}
        applicationStatus="REJECTED"
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});

describe('ApplicantInterviewScheduleCard — 터미널 + 라운드 있음', () => {
  it('합격 처리된 지원자도 확정된 면접 기록은 보인다', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={{ ...baseRound, memberStatus: 'ASSIGNED' }}
        assignedSlot={slotA}
        applicationStatus="ACCEPTED"
      />,
    );

    expect(screen.getByText('1차 면접')).toBeInTheDocument();
    expect(screen.getByText('면접 확정')).toBeInTheDocument();
  });
});

describe('ApplicantInterviewScheduleCard — memberStatus 분기', () => {
  it('memberStatus=RESPONDED → "응답 완료 — 선택 N개" 문구가 노출된다', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={{ ...baseRound, memberStatus: 'RESPONDED' }}
        interviewAvailabilities={[slotA, slotB]}
      />,
    );

    expect(screen.getByText('응답 완료 — 선택 2개')).toBeInTheDocument();
  });

  it('memberStatus=NO_AVAILABLE_SLOT + 사유 null → 인용 박스가 렌더되지 않는다', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={{
          ...baseRound,
          memberStatus: 'NO_AVAILABLE_SLOT',
          alternativeAvailabilityText: null,
        }}
      />,
    );

    expect(screen.getByText('가능한 시간 없음')).toBeInTheDocument();
    expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
  });

  it('interviewAvailabilities=[] → "아직 선택하지 않았습니다" 문구가 노출된다', () => {
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewAvailabilities={[]}
      />,
    );

    expect(screen.getByText('아직 선택하지 않았습니다')).toBeInTheDocument();
  });
});

describe('ApplicantInterviewScheduleCard — Override(선택 외 슬롯 배정)', () => {
  it('배정 슬롯이 availabilities 목록에 없으면 목록 row 에 "현재 배정" 뱃지가 없다', () => {
    // slotA만 선택했지만 slotB(선택하지 않은 슬롯)가 배정된 경우
    const slotC: AvailabilityItem = {
      slotId: 99,
      startTime: '2026-06-13T20:00:00',
      endTime: '2026-06-13T20:30:00',
    };
    render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={{ ...baseRound, memberStatus: 'ASSIGNED' }}
        interviewAvailabilities={[slotA]}
        assignedSlot={slotC}
      />,
    );

    const list = screen.getByRole('list', { name: '지원자가 선택한 면접 가능 시간' });
    const items = within(list).getAllByRole('listitem');
    // 목록에 있는 slotA row에는 "현재 배정" 뱃지가 없어야 한다
    items.forEach((row) => {
      expect(row).not.toHaveTextContent('현재 배정');
    });
  });

  it('배정 슬롯이 availabilities 목록에 없어도 현재 배정 dt 레이블이 표시된다', () => {
    const slotC: AvailabilityItem = {
      slotId: 99,
      startTime: '2026-06-13T20:00:00',
      endTime: '2026-06-13T20:30:00',
    };
    const { container } = render(
      <ApplicantInterviewScheduleCard
        {...defaultProps}
        interviewRound={{ ...baseRound, memberStatus: 'ASSIGNED' }}
        interviewAvailabilities={[slotA]}
        assignedSlot={slotC}
      />,
    );

    // dl 구조의 "현재 배정" dt 레이블이 있어야 한다
    const dtEl = container.querySelector('dt');
    expect(dtEl).not.toBeNull();
    expect(dtEl?.textContent).toBe('현재 배정');
  });
});
