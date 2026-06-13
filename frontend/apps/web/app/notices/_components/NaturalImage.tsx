'use client';

import { useState } from 'react';

type Props = {
  src: string;
  alt: string;
  className?: string;
};

export function NaturalImage({ src, alt, className }: Props) {
  // src 가 바뀌면 errorSrc 가 stale 해져 isError 가 false 로 복귀 — useEffect reset 없이 새 URL 진입 시 폴백 해제.
  const [errorSrc, setErrorSrc] = useState<string | null>(null);
  const isError = errorSrc === src;

  if (isError) {
    return (
      <div
        role="img"
        aria-label="이미지를 불러올 수 없습니다"
        className={`grid place-items-center bg-graysoft text-charcoal-3 text-[13px] py-12 rounded-lg ${className ?? ''}`}
      >
        이미지를 불러올 수 없습니다
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, 자연 비율 유지를 위해 intrinsic <img> 사용
    <img
      src={src}
      alt={alt}
      onError={() => setErrorSrc(src)}
      className={`w-full h-auto rounded-lg ${className ?? ''}`}
    />
  );
}
