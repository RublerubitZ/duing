import type { PanelStep } from './BookingPanel';

const STEP_LABELS = ['시간 선택', '신청 확인', '승인 대기'] as const;

export function PanelStepIndicator({ step }: { step: PanelStep }) {
  const activeIndex = step === 'slots' ? 0 : step === 'form' ? 1 : 2;
  return (
    <ol className="flex items-center gap-1.5 text-[11px]" aria-label="예약 진행 단계">
      {STEP_LABELS.map((label, index) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
              index < activeIndex ? 'bg-sage-mist text-ink' : index === activeIndex ? 'bg-ink text-cream' : 'border border-line text-charcoal-3'
            }`}
          >
            {index + 1}
          </span>
          <span className={index === activeIndex ? 'font-bold text-ink-deep' : 'text-charcoal-3'}>{label}</span>
          {index < STEP_LABELS.length - 1 && <span aria-hidden className="h-px w-3 bg-line" />}
        </li>
      ))}
    </ol>
  );
}
