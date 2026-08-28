'use client';

import Link from 'next/link';
import { safeExternalHref, toLinkRoute } from '@/app/_lib/route';

/** SystemComposedSlide.tsx 와 동일 구조의 슬라이드 데이터. */
export type FullBleedSlideData = {
  key: string;
  href: string | null;
  bannerImageUrl: string | null;
  imageAltText: string | null;
};

export function FullBleedSlide({ slide }: { slide: FullBleedSlideData }) {
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
