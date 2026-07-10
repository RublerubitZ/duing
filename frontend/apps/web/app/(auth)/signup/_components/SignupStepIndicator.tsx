type Props = {
  step: 1 | 2;
};

const STEPS = [
  { index: 1, label: '① 휴대폰 인증' },
  { index: 2, label: '② 기본 정보' },
] as const;

export function SignupStepIndicator({ step }: Props) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex gap-1.5">
        {STEPS.map(({ index }) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-ink' : 'bg-line'}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs font-medium text-charcoal-3">
        {STEPS.map(({ index, label }) => (
          <span key={index} className={index <= step ? 'text-ink' : undefined}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
