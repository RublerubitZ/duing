'use client';

import Link from 'next/link';
import type { PromotionRenderMode } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';
import { SparkleFull } from '@/components/duing/Sparkle';

/** BannerCarousel.tsx 의 내부 CarouselSlide 와 동일 형태. 패키지 의존성 없이 props 로 받기 위해 재선언. */
export type SystemComposedSlideData = {
  key: string;
  tag: string;
  title: string;
  sub: string;
  cta: string;
  bg: string;
  fg: string;
  accent: string;
  emoji: string;
  href: string | null;
  bannerImageUrl: string | null;
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
};

type Props =
  | { variant: 'main'; slide: SystemComposedSlideData }
  | {
      variant: 'preview';
      slide: SystemComposedSlideData;
      direction: 'left' | 'right';
      animationDelay?: string;
      onSelect(): void;
    };

export function SystemComposedSlide(props: Props) {
  if (props.variant === 'main') {
    return <MainSlideBody slide={props.slide} />;
  }
  return (
    <PreviewSlideBody
      slide={props.slide}
      direction={props.direction}
      animationDelay={props.animationDelay}
      onSelect={props.onSelect}
    />
  );
}

function MainSlideBody({ slide }: { slide: SystemComposedSlideData }) {
  const hasImage = !!slide.bannerImageUrl;
  // 이미지가 깔리면 가독성을 위해 텍스트를 흰색 톤으로 고정한다.
  const isDarkText = hasImage || slide.fg === '#fff';
  const textColor = hasImage ? '#fff' : slide.fg;
  const body = (
    <div
      className="relative flex h-full flex-col justify-between px-12 py-11"
      style={{ background: slide.bg, color: textColor }}
    >
      {hasImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL (Local / Supabase Storage). 깨지면 slide.bg 색만 노출되도록 onError 에서 숨김. */}
          <img
            src={slide.bannerImageUrl ?? ''}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          {/* 톤다운 레이어 — 흰 이미지에서도 흰 텍스트가 묻히지 않도록 전체에 옅은 다크 깔기. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.22)' }}
          />
          {/* 하단 그라데이션 — 텍스트 영역을 더 어둡게 덮어 제목/CTA 가독성 추가 확보. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)' }}
          />
        </>
      )}
      {slide.emoji && (
        <div
          className="pointer-events-none absolute -right-2.5 -top-5 text-[220px] leading-none opacity-[0.18]"
          style={{ transform: 'rotate(-12deg)' }}
        >
          {slide.emoji}
        </div>
      )}
      <SparkleFull
        size={32}
        color={slide.accent}
        className="absolute right-[200px] top-7 opacity-85"
      />
      <SparkleFull
        size={20}
        color={slide.accent}
        className="absolute bottom-12 right-[320px] opacity-50"
      />

      {slide.tag && (
        <div
          className="relative inline-flex items-center gap-2 self-start rounded-full px-3 py-[5px] text-[11.5px] font-extrabold tracking-wide08"
          style={{
            background: hasImage
              ? 'rgba(255,255,255,0.95)'
              : isDarkText ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
            color: hasImage ? '#143025' : isDarkText ? '#9DB6A0' : slide.accent,
          }}
        >
          {slide.tag}
        </div>
      )}
      <div className="relative">
        <h2
          className="mb-2.5 whitespace-pre-line text-5xl leading-[1.05] tracking-[-0.025em]"
          style={{ color: textColor }}
        >
          {slide.title}
        </h2>
        {slide.sub && (
          <p
            className="mb-6 max-w-[460px] text-[15.5px] leading-[1.5]"
            style={{ color: textColor, opacity: 0.85 }}
          >
            {slide.sub}
          </p>
        )}
        {slide.cta && (
          <span
            className="btn rounded-md px-[22px] py-3 font-bold"
            style={{
              background: isDarkText ? '#9DB6A0' : slide.accent,
              color: isDarkText ? '#143025' : '#fff',
            }}
          >
            {slide.cta}
            <ArrowRight />
          </span>
        )}
      </div>
    </div>
  );

  // href === null → Spec #7 의 비인터랙티브 컨테이너 (role/tab/cursor 모두 비활성).
  if (slide.href === null) {
    return <div className="block h-full cursor-default">{body}</div>;
  }
  // typedRoutes 검증을 위해 외부 URL / 내부 라우트를 구분한다.
  if (slide.href.startsWith('http')) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {body}
      </a>
    );
  }
  // 내부 경로는 string 으로 캐스팅 — DB 가 임의의 path 를 줄 수 있어 typedRoutes 검증 우회가 필요하다.
  return (
    <Link href={slide.href as never} className="block h-full">
      {body}
    </Link>
  );
}

type PreviewBodyProps = {
  slide: SystemComposedSlideData;
  direction: 'left' | 'right';
  animationDelay?: string;
  onSelect(): void;
};

function PreviewSlideBody({ slide, direction, animationDelay, onSelect }: PreviewBodyProps) {
  const hasImage = !!slide.bannerImageUrl;
  const isDarkText = hasImage || slide.fg === '#fff';
  const textColor = hasImage ? '#fff' : slide.fg;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative aspect-[85/37] cursor-pointer overflow-hidden rounded-lg px-5 py-[18px] text-left',
        direction === 'left' ? 'animate-preview-in' : 'animate-preview-in-reverse',
      )}
      style={{ background: slide.bg, color: textColor, animationDelay }}
    >
      {hasImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL. 깨지면 slide.bg 색만 노출되도록 onError 에서 숨김. */}
          <img
            src={slide.bannerImageUrl ?? ''}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.22)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 100%)' }}
          />
        </>
      )}
      {slide.emoji && (
        <div
          className="absolute -right-2.5 -top-2.5 text-[86px] leading-none opacity-[0.22]"
          style={{ transform: 'rotate(-8deg)' }}
        >
          {slide.emoji}
        </div>
      )}
      {slide.tag && (
        <div
          className="relative mb-1.5 inline-flex items-center rounded-full px-2 py-[2px] text-[10.5px] font-extrabold tracking-wide08"
          style={{
            background: hasImage ? 'rgba(255,255,255,0.95)' : 'transparent',
            color: hasImage ? '#143025' : isDarkText ? '#9DB6A0' : slide.accent,
            paddingInline: hasImage ? '8px' : '0',
          }}
        >
          {slide.tag.split(' · ')[0]}
        </div>
      )}
      <div
        className="relative whitespace-pre-line font-display text-[19px] font-bold leading-[1.15]"
        style={{ color: textColor }}
      >
        {slide.title}
      </div>
      {slide.sub && (
        <div
          className="relative mt-2 text-xs"
          style={{ color: textColor, opacity: 0.85 }}
        >
          {slide.sub.split(' · ')[0]}
        </div>
      )}
    </button>
  );
}
