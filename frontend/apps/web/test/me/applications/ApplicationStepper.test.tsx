import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MyApplicationDetail } from '@duing/types';

import { ApplicationStepper } from '@/app/me/applications/[applicationId]/_components/ApplicationStepper';

// Spec P0-1 의 5단계 진행 막대 + Step 3 sub-state 안내 매트릭스를 검증한다.
// 메인 단계:
//   1. SUBMITTED → '지원 완료'
//   2. UNDER_REVIEW → '서류 검토 중'
//   3. INTERVIEW_PENDING && !scheduleAssigned → '면접 대상'
//   4. INTERVIEW_PENDING && scheduleAssigned  → '면접 일정 배정 완료'
//   5. ACCEPTED → '최종 합격' / REJECTED → '최종 불합격'
// Step 3 활성 시 sub-state 별 안내 문구 (spec wording 그대로).

type StepperDetail = Pick<
  MyApplicationDetail,
  'status' | 'interviewAvailabilityCount' | 'interviewScheduleAssigned' | 'availabilityDeadline'
>;

function makeDetail(overrides: Partial<StepperDetail> = {}): StepperDetail {
  return {
    status: 'SUBMITTED',
    interviewAvailabilityCount: 0,
    interviewScheduleAssigned: false,
    availabilityDeadline: null,
    ...overrides,
  };
}

const NOW = new Date('2026-06-09T10:00:00');

describe('ApplicationStepper', () => {
  it('marks "지원 완료" as the active step when status is SUBMITTED', () => {
    render(<ApplicationStepper detail={makeDetail({ status: 'SUBMITTED' })} now={NOW} />);
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('지원 완료');
  });

  it('marks "서류 검토 중" as the active step when status is UNDER_REVIEW', () => {
    render(<ApplicationStepper detail={makeDetail({ status: 'UNDER_REVIEW' })} now={NOW} />);
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('서류 검토 중');
  });

  it('marks "면접 대상" as active and shows "선택 대기" sub-state copy', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({
          status: 'INTERVIEW_PENDING',
          interviewAvailabilityCount: 0,
          interviewScheduleAssigned: false,
          availabilityDeadline: '2026-06-15T18:00:00',
        })}
        now={NOW}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('면접 대상');
    expect(
      screen.getByText('운영진이 면접 대상으로 선정했습니다. 면접 가능 시간을 선택해 주세요.'),
    ).toBeInTheDocument();
  });

  it('shows the "제출 완료" sub-state copy with the submitted count', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({
          status: 'INTERVIEW_PENDING',
          interviewAvailabilityCount: 3,
          interviewScheduleAssigned: false,
          availabilityDeadline: '2026-06-15T18:00:00',
        })}
        now={NOW}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('면접 대상');
    expect(
      screen.getByText('면접 가능 시간 3개를 제출했습니다. 운영진이 일정을 배정 중입니다.'),
    ).toBeInTheDocument();
  });

  it('shows the "제출 마감" sub-state copy after deadline with no availability', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({
          status: 'INTERVIEW_PENDING',
          interviewAvailabilityCount: 0,
          interviewScheduleAssigned: false,
          availabilityDeadline: '2026-06-01T18:00:00',
        })}
        now={NOW}
      />,
    );
    expect(
      screen.getByText(
        '면접 가능 시간 제출이 마감되었습니다. 운영진과 별도 연락이 있을 수 있습니다.',
      ),
    ).toBeInTheDocument();
  });

  it('marks "면접 일정 배정 완료" as active when schedule is assigned', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({
          status: 'INTERVIEW_PENDING',
          interviewAvailabilityCount: 3,
          interviewScheduleAssigned: true,
          availabilityDeadline: '2026-06-15T18:00:00',
        })}
        now={NOW}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('면접 일정 배정 완료');
    // Step 3 sub-state 안내는 Step 4 활성 시점에는 노출하지 않는다.
    expect(
      screen.queryByText(/면접 가능 시간 제출이 마감되었습니다/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/운영진이 일정을 배정 중입니다/),
    ).not.toBeInTheDocument();
  });

  it('renders "최종 합격" label when status is ACCEPTED', () => {
    render(<ApplicationStepper detail={makeDetail({ status: 'ACCEPTED' })} now={NOW} />);
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('최종 합격');
  });

  it('renders "최종 불합격" label when status is REJECTED', () => {
    render(<ApplicationStepper detail={makeDetail({ status: 'REJECTED' })} now={NOW} />);
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('최종 불합격');
  });
});
