import type { InterviewStep } from '../_utils/deriveInterviewStep';

// spec §4 — 운영진 면접 관리 4 단계 라벨.
// active 단계엔 aria-current="step" 을 부여해 보조 기술 사용자가 현재 단계를 알 수 있게 한다.
const STEP_LABELS: readonly string[] = ['면접 설정', '슬롯 관리', '자동 배정', '일정 관리'];

type Props = {
  currentStep: InterviewStep;
};

export function InterviewProgressStepper({ currentStep }: Props) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="면접 관리 진행 단계">
      {STEP_LABELS.map((label, index) => {
        const step = (index + 1) as InterviewStep;
        const isActive = step === currentStep;
        const isPast = step < currentStep;
        const tone = isActive
          ? 'bg-sky-100 text-sky-800 font-semibold'
          : isPast
            ? 'bg-slate-100 text-slate-600'
            : 'bg-white text-slate-400';
        return (
          <li
            key={step}
            aria-current={isActive ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm ${tone}`}
          >
            <span className="text-xs">{step}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
