import { promoClubs } from '../../_data';
import { CategoryIcon } from '../CategoryIcon';

const FILTER_CHIPS = ['전체', '학술', '음악', 'IT'] as const;

/** 동아리 탐색 — 카테고리 필터 + 카드 그리드 미리보기. */
export function ExploreMockup() {
  const clubs = promoClubs.slice(0, 4);

  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-2">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_CHIPS.map((chip, idx) => (
          <span key={chip} className={idx === 0 ? 'pill pill-solid' : 'pill pill-outline'}>
            {chip}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {clubs.map((club) => (
          <div key={club.id} className="flex items-center gap-3 rounded-md border border-line bg-cream p-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md"
              style={{
                background: `linear-gradient(135deg, ${club.accent}22 0%, ${club.accent}11 100%)`,
                color: club.accent,
              }}
            >
              <CategoryIcon cat={club.cat} size={18} />
            </span>
            <div className="min-w-0">
              <span className="pill mb-1 px-2 py-0.5 text-[10px]">{club.cat}</span>
              <div className="truncate text-[13.5px] font-bold leading-tight text-ink-deep">
                {club.name}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-charcoal-3">{club.members}명</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
