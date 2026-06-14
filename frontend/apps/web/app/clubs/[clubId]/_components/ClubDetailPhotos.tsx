import type { ClubPhoto } from '@duing/types';

type Props = { photos: ClubPhoto[] };

export function ClubDetailPhotos({ photos }: Props) {
  if (photos.length === 0) return null;

  const visible = photos.slice(0, 8);
  const remainder = Math.max(0, photos.length - 8);

  return (
    <section className="mt-12">
      <h3 className="mb-4 text-lg font-bold text-ink-deep">
        활동 사진 · {photos.length}장
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {visible.map((photo, index) => {
          const isLast = index === visible.length - 1;
          const showOverlay = isLast && remainder > 0;
          return (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-[14px] border border-line bg-sage-mist"
            >
              <img
                src={photo.storageKey}
                alt={photo.caption ?? ''}
                className="h-full w-full object-cover"
              />
              {showOverlay && (
                <div className="absolute inset-0 grid place-items-center rounded-[14px] bg-ink/70 font-display text-[22px] font-bold text-white">
                  +{remainder}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
