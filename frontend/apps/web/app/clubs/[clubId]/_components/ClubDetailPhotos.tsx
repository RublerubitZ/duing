'use client';

import { useState } from 'react';

import type { ClubPhoto } from '@duing/types';

import { PhotoLightbox } from './PhotoLightbox';

type Props = { photos: ClubPhoto[] };

export function ClubDetailPhotos({ photos }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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
            <button
              key={photo.id}
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={
                showOverlay
                  ? `활동 사진 ${index + 1} 외 ${remainder}장 더 보기`
                  : (photo.caption ?? `활동 사진 ${index + 1} 크게 보기`)
              }
              className="relative aspect-square overflow-hidden rounded-[14px] border border-line bg-sage-mist transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 외부 Storage URL. 활동 사진 썸네일. */}
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
            </button>
          );
        })}
      </div>

      <PhotoLightbox
        slides={photos.map((photo) => ({
          id: photo.id,
          imageUrl: photo.storageKey,
          title: null,
          caption: photo.caption,
        }))}
        initialIndex={openIndex ?? 0}
        open={openIndex !== null}
        onClose={() => setOpenIndex(null)}
      />
    </section>
  );
}
