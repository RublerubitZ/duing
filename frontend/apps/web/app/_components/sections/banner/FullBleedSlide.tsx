'use client';

import Image from 'next/image';
import Link from 'next/link';
import { safeExternalHref, toLinkRoute } from '@/app/_lib/route';

/** SystemComposedSlide.tsx 와 동일 구조의 슬라이드 데이터. */
export type FullBleedSlideData = {
  key: string;
  href: string | null;
  bannerImageUrl: string | null;
  imageAltText: string | null;
};

type Props = {
  slide: FullBleedSlideData;
  /** 최초 마운트의 진입 슬롯만 true — 판정은 BannerCarouselClient 가 한다. */
  priority?: boolean;
};

export function FullBleedSlide({ slide, priority = false }: Props) {
  const body = slide.bannerImageUrl ? (
    <Image
      src={slide.bannerImageUrl}
      alt={slide.imageAltText ?? ''}
      fill
      // 배너는 어느 폭에서도 콘텐츠 폭(=뷰포트)을 가득 채운다.
      sizes="100vw"
      priority={priority}
      // 네이티브 드래그가 캐러셀 스와이프를 pointercancel 로 끊는 것을 막는다(전환 후에도 필수).
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

  // 래퍼의 relative 는 fill 이미지의 기준 박스를 명시적으로 잡는다 — 바깥 슬라이드 래퍼가 이미
  // absolute inset-0 라 지금 기하는 같지만, 여기 없으면 그 위쪽 구조가 바뀔 때 조용히 어긋난다.
  const externalHref = safeExternalHref(slide.href);
  if (externalHref) {
    return (
      <a
        href={externalHref}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-full"
      >
        {body}
      </a>
    );
  }
  const internalHref = toLinkRoute(slide.href);
  if (internalHref) {
    return (
      <Link href={internalHref} className="relative block h-full">
        {body}
      </Link>
    );
  }
  // href === null 이거나 javascript:/data: 등 안전하지 않은 값 → 비인터랙티브 컨테이너.
  return <div className="relative block h-full cursor-default">{body}</div>;
}
