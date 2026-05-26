'use client';

const rowInputCls =
  'w-full border border-[#cfcab8] bg-[#faf7ee] rounded-[8px] px-3 py-2 text-[14px] text-[#2a2f27] placeholder:text-[#b8b8ac] focus:outline-none focus:border-[#4a6b3f] focus:shadow-[0_0_0_3px_rgba(74,107,63,0.15)] transition-[border-color,box-shadow]';

const deleteBtnCls =
  'px-2 py-1.5 rounded-[6px] text-[12.5px] text-[#8a8f83] hover:text-[#b35a3a] hover:bg-[rgba(179,90,58,0.06)] cursor-pointer transition-colors bg-transparent border-none flex-shrink-0';

type HighlightsRepeaterProps = {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  maxItems?: number;
  maxLength?: number;
};

export function HighlightsRepeater({
  value, onChange, readOnly = false, maxItems = 10, maxLength = 100,
}: HighlightsRepeaterProps) {
  function update(idx: number, next: string) {
    onChange(value.map((item, i) => (i === idx ? next : item)));
  }

  function add() {
    if (value.length >= maxItems) return;
    onChange([...value, '']);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-1.5">
      {value.map((item, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-center">
          <input
            type="text"
            value={item}
            onChange={(event) => update(idx, event.target.value)}
            placeholder="예: 사이드 프로젝트 동료가 필요한 사람"
            maxLength={maxLength}
            disabled={readOnly}
            className={rowInputCls}
          />
          {!readOnly && (
            <button type="button" onClick={() => remove(idx)} className={deleteBtnCls}>
              삭제
            </button>
          )}
        </div>
      ))}

      {!readOnly && value.length < maxItems && (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 mt-1 bg-transparent border-none text-[13px] font-medium text-[#3e5b34] hover:text-[#4a6b3f] hover:underline cursor-pointer px-0 py-1"
        >
          + 강조 항목 추가 ({value.length}/{maxItems})
        </button>
      )}
    </div>
  );
}
