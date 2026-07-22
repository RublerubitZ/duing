'use client';

import type { ReactNode } from 'react';

type FormSegmentProps<Value extends string> = {
  options: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  onChange: (next: Value) => void;
  ariaLabel: string;
  disabled?: boolean;
};

/** 세그먼트 토글 — FeeCycleSegment 패턴의 일반화(role=radiogroup/radio, 듀잉 토큰). */
export function FormSegment<Value extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: FormSegmentProps<Value>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap gap-[3px] rounded-[11px] bg-graysoft p-[3px]">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-[9px] px-3.5 py-2 text-[13px] font-bold transition-colors disabled:cursor-default ${
              selected ? 'bg-paper text-ink-deep shadow-sm' : 'bg-transparent text-charcoal-3 hover:text-charcoal-2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type FormSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
};

/** ON/OFF 스위치 — role=switch, ink 트랙 + 흰 노브. */
export function FormSwitch({ checked, onChange, ariaLabel, disabled = false }: FormSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors disabled:cursor-default ${
        checked ? 'bg-ink' : 'bg-charcoal-3/50'
      }`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${
          checked ? 'left-[23px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

type SettingRowProps = {
  title: string;
  desc?: string;
  children: ReactNode;
};

/** 설정 행 카드 — 좌측 제목·설명 + 우측 컨트롤. */
export function SettingRow({ title, desc, children }: SettingRowProps) {
  return (
    <div className="mb-2.5 flex items-center gap-4 rounded-[13px] border border-line bg-cream px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold text-ink-deep">{title}</div>
        {desc && <div className="mt-0.5 text-xs leading-relaxed text-charcoal-3">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
