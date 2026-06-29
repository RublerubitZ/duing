'use client';

import { useState } from 'react';

import { ImageWithFallback } from '../../_components/ImageWithFallback';
import { NoticeImageLightbox, type NoticeImage } from './NoticeImageLightbox';

type Props = {
  coverImageUrl: string;
  title: string;
  summary: string;
};

export function NoticePosterHero({ coverImageUrl, title, summary }: Props) {
  const [zoomed, setZoomed] = useState<NoticeImage | null>(null);
  const hasCover = Boolean(coverImageUrl);

  return (
    <>
      <div className="grid md:grid-cols-[280px_1fr] gap-7 items-start mb-8">
        {hasCover ? (
          <button
            type="button"
            onClick={() => setZoomed({ src: coverImageUrl, alt: title })}
            aria-label={`${title} 대표 이미지 크게 보기`}
            className="aspect-[3/4] w-full overflow-hidden rounded-lg border border-line shadow-2 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          >
            <ImageWithFallback
              src={coverImageUrl}
              alt=""
              className="w-full h-full"
              emptyMessage="이미지 없음"
            />
          </button>
        ) : (
          <ImageWithFallback
            src={coverImageUrl}
            alt={title}
            className="aspect-[3/4] w-full rounded-lg overflow-hidden border border-line shadow-2"
            emptyMessage="이미지 없음"
          />
        )}
        {summary ? (
          <p className="text-[17.5px] leading-[1.8] font-medium text-charcoal">{summary}</p>
        ) : (
          <span />
        )}
      </div>
      <NoticeImageLightbox image={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}
