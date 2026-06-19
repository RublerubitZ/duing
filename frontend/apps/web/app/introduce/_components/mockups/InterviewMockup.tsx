import { promoInterviewSlots } from '../../_data';

// 가능시간 격자 — 지원자들이 응답한 슬롯을 흉내낸 정적 히트맵.
// 열(금/토/일) 3개에 맞춰 각 행도 3칸이다.
const SLOT_LABELS = ['금', '토', '일'] as const;
const AVAILABILITY: ReadonlyArray<ReadonlyArray<number>> = [
  [2, 3, 1],
  [1, 3, 3],
  [0, 2, 3],
];

function slotTint(level: number): string {
  if (level >= 3) return 'var(--ink)';
  if (level === 2) return 'var(--ink-soft)';
  if (level === 1) return 'var(--sage)';
  return 'var(--gray-soft)';
}

/** 면접 운영 — 가능시간 수합 → 자동 배정 결과 미리보기. */
export function InterviewMockup() {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-2">
      <div className="mb-3.5 flex items-center justify-between">
        <p className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em] text-charcoal-3">
          INTERVIEW · 1라운드
        </p>
        <span className="pill pill-solid gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          자동 배정 완료
        </span>
      </div>

      {/* 가능시간 히트맵 */}
      <div className="mb-3.5 rounded-md border border-line bg-cream p-3">
        <div className="mb-2 flex gap-2 pl-12">
          {SLOT_LABELS.map((day) => (
            <span key={day} className="w-7 text-center font-mono text-[10.5px] text-charcoal-3">
              {day}
            </span>
          ))}
        </div>
        {AVAILABILITY.map((row, rowIdx) => (
          <div key={`row-${SLOT_LABELS[rowIdx]}`} className="mb-1 flex items-center gap-2">
            <span className="w-10 text-right font-mono text-[10.5px] text-charcoal-3">
              {13 + rowIdx}시
            </span>
            <div className="flex gap-2 pl-2">
              {row.map((level, colIdx) => (
                <span
                  key={`cell-${rowIdx}-${colIdx}`}
                  className="h-7 w-7 rounded-sm"
                  style={{ background: slotTint(level) }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 배정 결과 */}
      <div className="flex flex-col gap-1.5">
        {promoInterviewSlots.map((slot) => (
          <div
            key={slot.id}
            className="flex items-center justify-between rounded-md border border-line bg-cream px-3 py-2"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-charcoal">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-sage-mist text-[10.5px] font-bold text-ink">
                {slot.name[0]}
              </span>
              {slot.name}
            </span>
            <span className="font-mono text-[11.5px] text-ink">
              {slot.day} · {slot.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
