'use client';

import { cn } from '@/app/_lib/cn';
import { useImageLoadFade } from '@/app/_lib/useImageLoadFade';

type Props = {
  imageUrl: string;
  alt: string;
};

/**
 * 대표 활동 카드의 이미지 — 로드 완료 때 드러난다(useImageLoadFade). 카드(HeroActivityCard)는 서버 컴포넌트로 남기고 이미지만
 * 클라이언트다. 상세에서는 대표 활동 재요청이 끝난 뒤 마운트되므로 하드 로드에서도 페이드로 들어온다 — 모바일에서는 첫 화면
 * 아래쪽에 걸쳐 LCP 후보가 될 수 있다.
 */
export function HeroActivityImage({ imageUrl, alt }: Props) {
  const fade = useImageLoadFade();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 Storage URL. 대표 활동 카드 이미지.
    <img
      src={imageUrl}
      alt={alt}
      draggable={false}
      className={cn('absolute inset-0 h-full w-full object-cover', fade.className)}
      {...fade.imageProps}
    />
  );
}
