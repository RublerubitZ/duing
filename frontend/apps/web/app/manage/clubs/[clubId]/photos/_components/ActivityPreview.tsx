import type { ClubHeroActivity, ClubPhoto } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { HeroActivityCard } from '@/app/_components/HeroActivityCard';

const PREVIEW_GRID_MAX = 6;

type PreviewProps = {
  clubName: string;
  heroActivities: ClubHeroActivity[];
  photos: ClubPhoto[];
};

/**
 * 학생에게 보일 활동 영역의 순수 프레젠테이션 미리보기(쿼리 0). 편집 화면과 같은 HeroActivityCard 양식을
 * 재사용해 실제 노출 모습을 그대로 보여준다. 헤더 → 대표 활동 Hero + dots → 전체 사진 그리드.
 */
export function ActivityPreview({ clubName, heroActivities, photos }: PreviewProps) {
  return (
    <div className="space-y-4 rounded-[18px] border border-line bg-white p-4">
      <header className="flex items-center gap-1.5 text-[13px] font-semibold">
        <span className="text-ink">{clubName}</span>
        <span aria-hidden className="text-charcoal-3">
          ·
        </span>
        <span className="text-charcoal-2">활동</span>
      </header>
      <ActivityPreviewHero heroActivities={heroActivities} />
      <ActivityPreviewGrid photos={photos} />
    </div>
  );
}

/** 첫 대표 활동을 크게 + swipe dots(첫 dot 길게, 수=hero 수). hero 없으면 빈 상태 문구. */
export function ActivityPreviewHero({ heroActivities }: { heroActivities: ClubHeroActivity[] }) {
  const first = heroActivities[0];
  if (!first) {
    return (
      <div className="grid aspect-[4/5] place-items-center rounded-[14px] border border-dashed border-charcoal-3/40 bg-sage-mist/40 px-4 text-center text-[12.5px] text-charcoal-2">
        대표 활동을 등록하면 여기에 보여요
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <HeroActivityCard
        imageUrl={first.storageKey}
        title={first.title}
        description={first.description}
      />
      <div data-testid="preview-hero-dots" className="flex items-center justify-center gap-1.5">
        {heroActivities.map((hero, index) => (
          <span
            key={hero.id}
            aria-hidden
            className={cn(
              'h-1.5 rounded-full transition-all',
              index === 0 ? 'w-4 bg-ink' : 'w-1.5 bg-charcoal-3/40',
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** 전체 사진 3열 최대 6장. 6장 초과 시 마지막 칸에 "+N" 오버레이. */
export function ActivityPreviewGrid({ photos }: { photos: ClubPhoto[] }) {
  if (photos.length === 0) return null;
  const visible = photos.slice(0, PREVIEW_GRID_MAX);
  const overflow = photos.length - PREVIEW_GRID_MAX;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {visible.map((photo, index) => {
        const showOverflow = index === PREVIEW_GRID_MAX - 1 && overflow > 0;
        return (
          <div
            key={photo.id}
            className="relative aspect-square overflow-hidden rounded-md border border-line bg-sage-mist"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Storage URL 썸네일. 미리보기 전용. */}
            <img
              src={photo.storageKey}
              alt={photo.caption ?? ''}
              draggable={false}
              className={cn('h-full w-full object-cover', showOverflow && 'brightness-50')}
            />
            {showOverflow && (
              <span className="absolute inset-0 grid place-items-center text-[15px] font-bold text-white">
                +{overflow}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
