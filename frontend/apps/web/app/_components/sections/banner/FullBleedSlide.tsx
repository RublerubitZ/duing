'use client';

import Link from 'next/link';
import { cn } from '@/app/_lib/cn';

/** SystemComposedSlide.tsx 와 동일 구조의 슬라이드 데이터. */
export type FullBleedSlideData = {
  key: string;
  href: string;
  bannerImageUrl: string | null;
  imageAltText: string | null;
};

type Props =
  | { variant: 'main'; slide: FullBleedSlideData }
  | {
      variant: 'preview';
      slide: FullBleedSlideData;
      direction: 'left' | 'right';
      animationDelay?: string;
      onSelect(): void;
    };

export function FullBleedSlide(props: Props) {
  if (props.variant === 'main') {
    return <FullBleedMainBody slide={props.slide} />;
  }
  return (
    <FullBleedPreviewBody
      slide={props.slide}
      direction={props.direction}
      animationDelay={props.animationDelay}
      onSelect={props.onSelect}
    />
  );
}

function FullBleedMainBody({ slide }: { slide: FullBleedSlideData }) {
  const body = slide.bannerImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL.
    <img
      src={slide.bannerImageUrl}
      alt={slide.imageAltText ?? ''}
      className="block h-full w-full object-cover"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    <div className="flex h-full items-center justify-center bg-graysoft text-charcoal-3 text-[13px]">
      배너 이미지가 없습니다
    </div>
  );

  if (slide.href.startsWith('http')) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {body}
      </a>
    );
  }
  return (
    <Link href={slide.href as never} className="block h-full">
      {body}
    </Link>
  );
}

function FullBleedPreviewBody({
  slide,
  direction,
  animationDelay,
  onSelect,
}: {
  slide: FullBleedSlideData;
  direction: 'left' | 'right';
  animationDelay?: string;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex-1 cursor-pointer overflow-hidden rounded-lg bg-graysoft',
        direction === 'left' ? 'animate-preview-in' : 'animate-preview-in-reverse',
      )}
      style={{ animationDelay }}
      aria-label={slide.imageAltText ?? '배너로 이동'}
    >
      {slide.bannerImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL.
        <img
          src={slide.bannerImageUrl}
          alt={slide.imageAltText ?? ''}
          className="block h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-charcoal-3 text-[11px]">
          이미지 없음
        </div>
      )}
    </button>
  );
}
