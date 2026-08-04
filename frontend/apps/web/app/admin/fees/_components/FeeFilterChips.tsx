'use client';

type Props<T extends string> = {
  ariaLabel: string;
  /** value 를 생략한 항목이 "전체"다 — 서버에 필터 파라미터를 아예 보내지 않는 상태를 뜻한다. */
  options: { label: string; value?: T }[];
  value?: T;
  onChange: (next?: T) => void;
};

/**
 * 감사 콘솔 필터칩(회비 사용 여부·청구 상태·납부 상태 공용).
 *
 * <p>탭이 아니라 필터라 `role="group"` + `aria-pressed` 다 — `role="tab"` 으로 두면 보조기술이
 * 화면을 갈아끼우는 탭으로 안내하지만 실제로는 같은 표를 좁히는 토글이다.
 */
export function FeeFilterChips<T extends string>({ ariaLabel, options, value, onChange }: Props<T>) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
              selected
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-charcoal-2 hover:bg-graysoft'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
