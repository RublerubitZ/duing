'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  emptyMessage?: string;
  errorMessage?: string;
};

type State = 'empty' | 'loaded' | 'error';

export function ImageWithFallback({
  src,
  alt,
  className,
  emptyMessage = '대표 이미지 없음',
  errorMessage = '이미지를 불러올 수 없습니다',
}: Props) {
  const initial: State = src ? 'loaded' : 'empty';
  const [state, setState] = useState<State>(initial);

  useEffect(() => {
    setState(src ? 'loaded' : 'empty');
  }, [src]);

  const containerClass = `relative bg-graysoft ${className ?? ''}`;

  if (state === 'loaded' && src) {
    return (
      <div className={containerClass}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image 도메인 화이트리스트는 후속 PR. */}
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setState('error')}
        />
      </div>
    );
  }

  const message = state === 'empty' ? emptyMessage : errorMessage;
  return (
    <div className={containerClass} role="img" aria-label={message}>
      <div className="absolute inset-0 grid place-items-center text-charcoal-3 text-[13px] gap-1">
        <ImageOff className="w-6 h-6" aria-hidden />
        <span>{message}</span>
      </div>
    </div>
  );
}
