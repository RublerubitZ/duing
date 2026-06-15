'use client';

// wizard 4단계 스텝퍼 — InterviewProgressStepper 패턴 재사용.
// 라운드 생성 wizard 전용 라벨: 대상 선정 / 라운드 정보 / 슬롯 등록 / 검토·발송.

const STEP_LABELS: readonly string[] = ['대상 선정', '라운드 정보', '슬롯 등록', '검토·발송'];

type WizardStep = 1 | 2 | 3 | 4;

type Props = {
  currentStep: WizardStep;
};

export function WizardStepper({ currentStep }: Props) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="라운드 생성 진행 단계">
      {STEP_LABELS.map((label, index) => {
        const step = (index + 1) as WizardStep;
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
