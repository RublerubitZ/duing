'use client';

import Link from 'next/link';
import { cn } from '@/app/_lib/cn';
import { safeExternalHref, toLinkRoute } from '@/app/_lib/route';

/** SystemComposedSlide.tsx 와 동일 구조의 슬라이드 데이터. */
export type FullBleedSlideData = {
  key: string;
  href: string | null;
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
      draggable={false}
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

  const externalHref = safeExternalHref(slide.href);
  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noopener noreferrer" className="block h-full">
        {body}
      </a>
    );
  }
  const internalHref = toLinkRoute(slide.href);
  if (internalHref) {
    return (
      <Link href={internalHref} className="block h-full">
        {body}
      </Link>
    );
  }
  // href === null 이거나 javascript:/data: 등 안전하지 않은 값 → 비인터랙티브 컨테이너.
  return <div className="block h-full cursor-default">{body}</div>;
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
        'relative aspect-[85/37] cursor-pointer overflow-hidden rounded-lg bg-graysoft',
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
          draggable={false}
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
