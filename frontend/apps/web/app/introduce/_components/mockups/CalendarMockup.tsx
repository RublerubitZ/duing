import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
// 11월 달력(1일 = 토요일 가정) — 모집 마감일 몇 곳을 강조한 정적 미리보기.
const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const LEADING_BLANKS = 6; // 1일 전 빈칸(토요일 시작)
const DEADLINE_DAYS = new Set([14, 21, 27]);

const UPCOMING = [
  { name: '두잉코드 26기', due: '11.21' },
  { name: '트레몰로 신입', due: '11.27' },
];

/** 모집 캘린더 — 모집 마감 일정을 한눈에 보는 학생 관점 미리보기. */
export function CalendarMockup() {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-2">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink-deep">
          <CalendarDays size={16} strokeWidth={1.75} className="text-ink" aria-hidden />
          11월 모집 일정
        </span>
        <span className="flex gap-1 text-charcoal-3">
          <ChevronLeft size={16} aria-hidden />
          <ChevronRight size={16} aria-hidden />
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 rounded-md border border-line bg-cream p-2.5">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-0.5 text-center tabular-nums text-[9.5px] text-charcoal-3">
            {day}
          </span>
        ))}
        {Array.from({ length: LEADING_BLANKS }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}
        {DAYS.map((day) => {
          const isDeadline = DEADLINE_DAYS.has(day);
          return (
            <span
              key={day}
              className={`grid h-6 place-items-center rounded-[6px] text-[10.5px] ${
                isDeadline ? 'bg-ink font-bold text-paper' : 'text-charcoal-2'
              }`}
            >
              {day}
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {UPCOMING.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between rounded-md border border-line bg-cream px-3 py-2"
          >
            <span className="text-[13px] font-semibold text-charcoal">{item.name}</span>
            <span className="pill gap-1.5 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-sage" />
              마감 {item.due}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
