'use client';

import {
  FEE_PERIOD_LABEL,
  FEE_PERIOD_PRESETS,
  resolvePeriodParams,
  type FeePeriodValue,
} from '../_lib/feePeriod';

type Props = {
  value: FeePeriodValue;
  onChange: (next: FeePeriodValue) => void;
};

const controlCls =
  'rounded-md border border-line bg-paper px-2.5 py-2 text-[12.5px] text-charcoal focus-visible:border-ink focus-visible:outline-none';

/**
 * 감사 콘솔 전역 기간 셀렉터. 목록과 상세가 같은 컴포넌트를 쓴다(기본 프리셋만 호출부가 정한다).
 * 직접 선택은 브라우저 기본 날짜 입력을 쓴다 — 달력 위젯을 따로 만들면 접근성·모바일 동작을 다시 짜야 한다.
 */
export function FeePeriodSelect({ value, onChange }: Props) {
  const handlePresetChange = (raw: string) => {
    const preset = FEE_PERIOD_PRESETS.find((candidate) => candidate === raw) ?? 'ALL';
    if (preset !== 'CUSTOM') {
      onChange({ preset });
      return;
    }
    // 직접 선택으로 넘어갈 때 보고 있던 구간을 그대로 채워 준다 — 빈 칸부터 시작하면 화면이 전체 기간으로 튄다.
    const current = resolvePeriodParams(value);
    onChange({ preset, from: current.from, to: current.to });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-charcoal-2">
        <span>기간</span>
        <select
          aria-label="기간"
          value={value.preset}
          onChange={(event) => handlePresetChange(event.target.value)}
          className={controlCls}
        >
          {FEE_PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {FEE_PERIOD_LABEL[preset]}
            </option>
          ))}
        </select>
      </label>

      {value.preset === 'CUSTOM' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="시작일"
            value={value.from ?? ''}
            // 시작일이 종료일을 넘지 못하게 브라우저가 막는다 — 뒤집힌 구간을 서버로 보내지 않는다.
            max={value.to}
            onChange={(event) => onChange({ ...value, from: event.target.value || undefined })}
            className={controlCls}
          />
          <span aria-hidden className="text-[12.5px] text-charcoal-3">
            ~
          </span>
          <input
            type="date"
            aria-label="종료일"
            value={value.to ?? ''}
            min={value.from}
            onChange={(event) => onChange({ ...value, to: event.target.value || undefined })}
            className={controlCls}
          />
        </div>
      )}
    </div>
  );
}
