import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MyApplicationDetail } from '@duing/types';
import type { ApplicantInterviewPhase } from '@duing/types';
import { ApplicationStepper } from '@/app/me/applications/[applicationId]/_components/ApplicationStepper';

// phase 기반 재배선 — applicantPhase 가 stepper 활성 단계·문구를 결정한다.
// 핵심 결정 2:
//   NOT_APPLICABLE → status fallback (SUBMITTED→0 / ACCEPTED·REJECTED→4)
//   DOCUMENT_REVIEW → 1
//   WAITING_*/AVAILABILITY_*/RESPONDED/NO_SLOT_REPORTED/SCHEDULING → 2
//   SCHEDULED → 3

type StepperDetail = Pick<
  MyApplicationDetail,
  'status' | 'interviewAvailabilityCount' | 'interview' | 'availabilityDeadline'
>;

function makeDetail(overrides: Partial<StepperDetail> = {}): StepperDetail {
  return {
    status: 'SUBMITTED',
    interviewAvailabilityCount: 0,
    interview: null,
    availabilityDeadline: null,
    ...overrides,
  };
}

describe('ApplicationStepper (phase 기반)', () => {
  it('phase=DOCUMENT_REVIEW 이면 1단계(서류 검토 중)가 활성이다', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'UNDER_REVIEW' })}
        phase={'DOCUMENT_REVIEW'}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('서류 검토 중');
  });

  it('phase=AVAILABILITY_REQUESTED 이면 2단계(면접 대상)가 활성이고 안내 문구가 보인다', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'INTERVIEW_PENDING' })}
        phase={'AVAILABILITY_REQUESTED'}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('면접 대상');
    // 안내 문구 — AVAILABILITY_REQUESTED description
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toContain('가능 시간');
  });

  it('phase=SCHEDULED 이면 3단계(면접 일정 배정 완료)가 활성이다', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'INTERVIEW_PENDING' })}
        phase={'SCHEDULED'}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('면접 일정 배정 완료');
  });

  it('phase=NOT_APPLICABLE + status=ACCEPTED → 4단계 최종 합격', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'ACCEPTED' })}
        phase={'NOT_APPLICABLE'}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('최종 합격');
  });

  it('phase=null(로딩 중) + status=SUBMITTED → 기존 status fallback(0단계)', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'SUBMITTED' })}
        phase={null}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('지원 완료');
  });
});
