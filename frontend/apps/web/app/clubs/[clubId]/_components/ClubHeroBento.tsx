import type { ClubHeroActivity } from '@duing/types';
import { HeroActivityCard } from '@/app/_components/HeroActivityCard';
import { cn } from '@/app/_lib/cn';

type Props = { heroActivities: ClubHeroActivity[]; onOpen: (index: number) => void };

// 개수별 배치 — 5·6개는 첫 카드 2×2 큰 대표(스펙·목업 Concept A 규칙).
const GRID_BY_COUNT: Record<number, string> = {
  1: 'grid-cols-1 max-w-[320px]',
  2: 'grid-cols-2 max-w-[640px]',
  3: 'grid-cols-3',
  4: 'grid-cols-2',
};

/** 학생 화면 PC 벤토 래퍼 — 배지 없음, 컴팩트 정렬. displayOrder 오름차순 입력 가정. */
export function ClubHeroBento({ heroActivities, onOpen }: Props) {
  const count = heroActivities.length;
  if (count === 0) return null;
  const featured = count >= 5;
  return (
    <div className={cn('grid gap-3.5', featured ? 'grid-cols-3' : GRID_BY_COUNT[count])}>
      {heroActivities.map((activity, index) => {
        const big = featured && index === 0;
        return (
          <button
            key={activity.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`${activity.title} 자세히 보기`}
            className={cn(
              'text-left transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
              big && 'col-span-2 row-span-2',
            )}
          >
            <HeroActivityCard
              imageUrl={activity.storageKey}
              title={activity.title}
              description={activity.description}
              size={big ? 'big' : 'default'}
            />
          </button>
        );
      })}
    </div>
  );
}
