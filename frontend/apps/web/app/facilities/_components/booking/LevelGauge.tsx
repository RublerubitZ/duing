import type { DayLevel } from '../../_lib/bookingCalendar';
import { DAY_LEVEL_META } from '../../_lib/bookingCalendar';

// 잔여 여유량 3단계 가로 게이지 — 여유 3칸·보통 2칸·혼잡 1칸·마감 0칸.
// 채움 방향은 sm 이상의 8칸 히트맵 바와 동일하다(많이 찰수록 여유) — 기기마다 반대로 읽히면 안 된다.
// 색상만으로 구분하지 않도록 채운 칸 수도 함께 신호로 쓴다.
const STEP_COUNT: Record<DayLevel, number> = { HIGH: 3, MID: 2, LOW: 1, FULL: 0 };

/**
 * 모바일 전용 혼잡도 마크(§3·§4) — sm 이상은 기존 8칸 히트맵 바 + 상태 텍스트를 그대로 쓴다.
 * 막대 두께·모서리·색·간격은 그 8칸 바와 동일하게 두고 칸 수만 8→3 으로 줄인 형태라,
 * 화면 크기가 바뀌어도 같은 표기의 압축판으로 읽힌다.
 * 캘린더 셀과 범례가 같은 마크를 공유해야 단계(1/2/3)의 의미가 학습되므로 한 곳에서 그린다.
 * 상태 정보는 셀 button 의 aria-label 이 이미 담고 있어 마크 자체는 aria-hidden.
 */
export function LevelGauge({ level, onDark = false }: { level: DayLevel; onDark?: boolean }) {
  if (level === 'FULL') {
    // 마감은 0단계 — 빈 게이지는 "표시 없음"과 구분되지 않으므로 같은 막대 언어의 대시로 못박는다.
    return (
      <span
        aria-hidden
        data-testid="level-gauge"
        data-level={level}
        className={`h-1 w-3 rounded-[1px] ${onDark ? 'bg-cream/50' : 'bg-charcoal-3'}`}
      />
    );
  }
  return (
    <span aria-hidden data-testid="level-gauge" data-level={level} className="flex w-[18px] gap-[1.5px]">
      {[0, 1, 2].map((step) => (
        <span
          key={step}
          className={`h-1 flex-1 rounded-[1px] ${
            step < STEP_COUNT[level]
              ? onDark
                ? 'bg-sage'
                : DAY_LEVEL_META[level].barClass
              : onDark
                ? 'bg-cream/20'
                : 'bg-line'
          }`}
        />
      ))}
    </span>
  );
}
