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
  const summaryClass = 'text-[17.5px] leading-[1.8] font-medium text-charcoal';

  // 커버 없는 공지(동아리 공지 다수)는 "이미지 없음" 자리표시 박스를 그리지 않는다 — 요약만, 없으면 아무것도.
  if (!coverImageUrl) {
    return summary ? <p className={`${summaryClass} mb-8`}>{summary}</p> : null;
  }

  return (
    <>
      <div className="grid md:grid-cols-[280px_1fr] gap-7 items-start mb-8">
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
          />
        </button>
        {summary ? <p className={summaryClass}>{summary}</p> : <span />}
      </div>
      <NoticeImageLightbox image={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}
