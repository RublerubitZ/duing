import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MyApplicationDetail } from '@duing/types';
import { ApplicationStepper } from '@/app/me/applications/[applicationId]/_components/ApplicationStepper';

// phase 기반 재배선 — applicantPhase 가 stepper 활성 단계·문구를 결정한다.
// 서류검토 단계 제거 + 면접 단계는 면접 모집에서만 (스펙 §5-5):
//   면접 모집   : 지원 완료(0) → 면접 대상(1) → 면접 일정 배정 완료(2) → 최종 결과(3)
//   비면접 모집 : 지원 완료(0) → 최종 결과(1)
//   WAITING_*/AVAILABILITY_*/RESPONDED/NO_SLOT_REPORTED/SCHEDULING → 1 / SCHEDULED → 2
//   NOT_APPLICABLE·null → status fallback (SUBMITTED·ON_HOLD→0 / ACCEPTED·REJECTED→마지막)

type StepperDetail = Pick<
  MyApplicationDetail,
  | 'status'
  | 'recruitmentStatus'
  | 'interviewAvailabilityCount'
  | 'interview'
  | 'availabilityDeadline'
  | 'useInterview'
>;

function makeDetail(overrides: Partial<StepperDetail> = {}): StepperDetail {
  return {
    status: 'SUBMITTED',
    recruitmentStatus: 'OPEN',
    interviewAvailabilityCount: 0,
    interview: null,
    availabilityDeadline: null,
    useInterview: true,
    ...overrides,
  };
}

describe('ApplicationStepper (phase 기반)', () => {
  it('면접 모집 스테퍼에는 서류검토 단계가 없다', () => {
    render(<ApplicationStepper detail={makeDetail()} phase={null} />);
    expect(screen.queryByText('서류 검토 중')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('비면접 모집 스테퍼에는 면접 단계가 없다 — 지원 완료·최종 결과 2단계', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ useInterview: false })}
        phase={'NOT_APPLICABLE'}
      />,
    );
    const stepLabels = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(stepLabels).toEqual(['지원 완료', '최종 결과']);
    expect(screen.queryByText('면접 대상')).not.toBeInTheDocument();
    expect(screen.queryByText('면접 일정 배정 완료')).not.toBeInTheDocument();
  });

  it('비면접 모집 + status=ACCEPTED 는 마지막 단계(최종 합격)가 활성이다', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ useInterview: false, status: 'ACCEPTED' })}
        phase={'NOT_APPLICABLE'}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('최종 합격');
  });

  it('SUBMITTED 와 ON_HOLD 는 지원자에게 동일하게 지원 완료(0단계)로 보인다', () => {
    const submitted = render(
      <ApplicationStepper detail={makeDetail({ status: 'SUBMITTED' })} phase={null} />,
    );
    const submittedSteps = screen.getAllByRole('listitem').map((item) => item.textContent);
    const submittedActive = screen.getByRole('listitem', { current: 'step' }).textContent;
    submitted.unmount();

    render(<ApplicationStepper detail={makeDetail({ status: 'ON_HOLD' })} phase={null} />);
    const onHoldSteps = screen.getAllByRole('listitem').map((item) => item.textContent);
    const onHoldActive = screen.getByRole('listitem', { current: 'step' }).textContent;

    expect(onHoldSteps).toEqual(submittedSteps);
    expect(onHoldActive).toBe(submittedActive);
    expect(onHoldActive).toBe('지원 완료');
  });

  it('phase=AVAILABILITY_REQUESTED 이면 면접 대상 단계가 활성이고 안내 문구가 보인다', () => {
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

  it('phase=SCHEDULED 이면 면접 일정 배정 완료 단계가 활성이다', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'INTERVIEW_PENDING' })}
        phase={'SCHEDULED'}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('면접 일정 배정 완료');
  });

  it('phase=NOT_APPLICABLE + status=ACCEPTED → 마지막 단계 최종 합격', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'ACCEPTED' })}
        phase={'NOT_APPLICABLE'}
      />,
    );
    const activeStep = screen.getByRole('listitem', { current: 'step' });
    expect(activeStep).toHaveTextContent('최종 합격');
  });

  it('모집이 마감된 미결 지원은 마지막 단계 라벨이 결과 미발표로 바뀐다', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'SUBMITTED', recruitmentStatus: 'CLOSED' })}
        phase={'NOT_APPLICABLE'}
      />,
    );

    expect(screen.getByText('결과 미발표')).toBeInTheDocument();
    expect(screen.queryByText('최종 결과')).toBeNull();
  });

  it('모집이 마감되면 면접 회차 준비 안내 대신 종료 안내를 보여준다 — 마감 후에는 회차를 만들 수 없다', () => {
    render(
      <ApplicationStepper
        detail={makeDetail({ status: 'INTERVIEW_PENDING', recruitmentStatus: 'CLOSED' })}
        phase={'WAITING_ROUND'}
      />,
    );

    const guide = screen.getByRole('status');
    expect(guide.textContent).toContain('모집이 종료되어');
    expect(guide.textContent).not.toContain('준비 중');
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
