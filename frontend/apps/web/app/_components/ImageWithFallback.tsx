'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/app/_lib/cn';

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  emptyMessage?: string;
  errorMessage?: string;
  /**
   * 이미지 fit 모드. 기본 'cover' — 컨테이너 가득 채우고 비율 보존(crop).
   * 'contain' — 원본 비율 유지하며 letterbox. 검토용 미리보기 등 잘리면 안 되는 케이스.
   */
  objectFit?: 'cover' | 'contain';
  /**
   * img 의 네이티브 드래그 허용 여부. 미지정 시 브라우저 기본값(허용).
   * dnd-kit 등 포인터 기반 드래그 영역 안에 둘 때는 false 로 꺼야 한다 —
   * 로드된 이미지의 네이티브 드래그가 dragstart 로 제스처를 가로채 정렬이 중단된다.
   */
  draggable?: boolean;
};

export function ImageWithFallback({
  src,
  alt,
  className,
  emptyMessage = '대표 이미지 없음',
  errorMessage = '이미지를 불러올 수 없습니다',
  objectFit = 'cover',
  draggable,
}: Props) {
  // src 가 바뀌면 errorSrc 가 자동으로 stale 해져 isError 가 false 로 복귀.
  // useEffect 로 reset 하던 패턴 대신 derived state — 새 URL 진입 시 깜빡임 없음.
  const [errorSrc, setErrorSrc] = useState<string | null>(null);
  const isError = src != null && src !== '' && errorSrc === src;
  const containerClass = cn('relative bg-graysoft', className);
  const fitClass = objectFit === 'contain' ? 'object-contain' : 'object-cover';

  if (src && !isError) {
    return (
      <div className={containerClass}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL. next/image 도메인 화이트리스트 후속 PR 예정. */}
        <img
          src={src}
          alt={alt}
          draggable={draggable}
          className={cn('absolute inset-0 w-full h-full', fitClass)}
          onError={() => setErrorSrc(src)}
        />
      </div>
    );
  }

  const message = isError ? errorMessage : emptyMessage;
  return (
    <div className={containerClass} role="img" aria-label={message}>
      <div className="absolute inset-0 grid place-items-center text-charcoal-3 text-[13px] gap-1">
        <ImageOff className="w-6 h-6" aria-hidden />
        <span aria-hidden="true">{message}</span>
      </div>
    </div>
  );
}
