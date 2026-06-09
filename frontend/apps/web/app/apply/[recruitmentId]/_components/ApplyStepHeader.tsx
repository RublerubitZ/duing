'use client';

type Props = {
  currentStep: 1 | 2;
  totalSteps: 1 | 2;
  onPrev?: () => void;
};

const STEP_LABELS: Record<1 | 2, string> = {
  1: '답변 작성',
  2: '면접 가능시간 선택',
};

export function ApplyStepHeader({ currentStep, totalSteps, onPrev }: Props) {
  if (totalSteps === 1) return null;

  return (
    <div className="mb-6 flex items-center justify-between gap-3" aria-label="진행 단계">
      <ol className="flex items-center gap-2 text-xs font-medium" aria-label="step indicator">
        {([1, 2] as const).map((step) => {
          const isActive = step === currentStep;
          const isDone = step < currentStep;
          return (
            <li
              key={step}
              aria-current={isActive ? 'step' : undefined}
              className={[
                'inline-flex items-center gap-2 rounded-full border px-3 py-1',
                isActive ? 'border-ink bg-ink text-cream' : '',
                isDone ? 'border-slate-300 bg-slate-50 text-slate-500' : '',
                !isActive && !isDone ? 'border-slate-300 bg-white text-slate-400' : '',
              ].join(' ')}
            >
              <span className="font-mono">{step}</span>
              <span>{STEP_LABELS[step]}</span>
            </li>
          );
        })}
      </ol>
      {currentStep === 2 && onPrev && (
        <button
          type="button"
          onClick={onPrev}
          className="text-xs font-medium text-charcoal-3 underline hover:text-charcoal"
        >
          이전 단계
        </button>
      )}
    </div>
  );
}
