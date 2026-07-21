export type SubmissionViewMode = 'list' | 'timetable';

type Props = {
  view: SubmissionViewMode;
  onChange: (view: SubmissionViewMode) => void;
  /** 배치 위치는 쓰는 쪽마다 달라 래퍼 클래스만 받는다(준비 탭=ml-auto, 상세=우측 정렬). */
  className?: string;
};

const VIEW_MODES = [
  ['list', '목록'],
  ['timetable', '시간표'],
] as const;

/** 예약을 목록/시간표 중 어떤 형태로 볼지 고르는 토글 — 준비 탭과 제출 목록 상세가 함께 쓴다. */
export function ViewModeToggle({ view, onChange, className }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`} role="tablist" aria-label="보기 전환">
      {VIEW_MODES.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={view === mode}
          onClick={() => onChange(mode)}
          className={`rounded-md border px-2.5 py-1.5 text-xs motion-safe:transition-colors ${
            view === mode ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
