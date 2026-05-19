'use client';

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
    <div className="space-y-2">
      {value.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => update(idx, e.target.value)}
            placeholder="예: 사이드 프로젝트 동료가 필요한 사람"
            maxLength={maxLength}
            disabled={readOnly}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-sm text-slate-500 hover:text-rose-600"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      {!readOnly && value.length < maxItems && (
        <button
          type="button"
          onClick={add}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          + 강조 항목 추가 ({value.length}/{maxItems})
        </button>
      )}
    </div>
  );
}
