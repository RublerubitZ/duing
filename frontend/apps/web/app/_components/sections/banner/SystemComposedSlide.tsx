'use client';

import Link from 'next/link';
import type { PromotionRenderMode } from '@duing/types';
import { safeExternalHref, toLinkRoute } from '@/app/_lib/route';
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

export function SystemComposedSlide({ slide }: { slide: SystemComposedSlideData }) {
  const hasImage = !!slide.bannerImageUrl;
  // 이미지가 깔리면 가독성을 위해 텍스트를 흰색 톤으로 고정한다.
  const isDarkText = hasImage || slide.fg === '#fff';
  const textColor = hasImage ? '#fff' : slide.fg;
  const body = (
    <div
      // 하단 패딩은 캐러셀 컨트롤 밴드를 비워 두는 몫이다 — justify-between 이라 CTA 가 하단에
      // 붙는데, md 미만에서는 점 인디케이터·정지 버튼이 가로로도 겹치는 위치라 세로로 비켜야 한다.
      // md 부터는 배너가 넓어 컨트롤이 우측에, 콘텐츠가 좌측에 떨어지므로 원래 여백으로 돌아간다.
      className="relative flex h-full flex-col justify-between px-5 pb-10 pt-3.5 sm:px-12 sm:pt-5 md:pb-5 lg:py-9"
      style={{ background: slide.bg, color: textColor }}
    >
      {hasImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL (Local / Supabase Storage). 깨지면 slide.bg 색만 노출되도록 onError 에서 숨김. */}
          <img
            src={slide.bannerImageUrl ?? ''}
            alt=""
            aria-hidden
            draggable={false}
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
            style={{
              background:
                'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)',
            }}
          />
        </>
      )}
      {slide.emoji && (
        <div
          className="pointer-events-none absolute -right-2.5 -top-4 text-[72px] leading-none opacity-[0.18] sm:-top-5 sm:text-[160px] md:text-[220px]"
          style={{ transform: 'rotate(-12deg)' }}
        >
          {slide.emoji}
        </div>
      )}
      {/* 장식 스파클은 데스크탑 좌표 기준 — 좁은 모바일 배너에선 숨김 */}
      <SparkleFull
        size={32}
        color={slide.accent}
        className="absolute right-[200px] top-7 hidden opacity-85 sm:block"
      />
      <SparkleFull
        size={20}
        color={slide.accent}
        className="absolute bottom-12 right-[320px] hidden opacity-50 sm:block"
      />

      {slide.tag && (
        <div
          // 태그는 60자까지 들어올 수 있어(백엔드 @Size) 그대로 두면 우측 상단 페이저 밑으로 파고든다.
          // md 부터 페이저가 차지하는 우측 폭만큼 비워 두고, 넘치면 말줄임한다.
          // 안쪽 span 의 min-w-0 이 없으면 flex 아이템이 글자 폭 아래로 안 줄어 max-w 가 무력해진다.
          className="tracking-wide08 relative inline-flex max-w-full items-center gap-2 self-start rounded-full px-3 py-[5px] text-[11.5px] font-extrabold md:max-w-[calc(100%-7rem)]"
          style={{
            background: hasImage
              ? 'rgba(255,255,255,0.95)'
              : isDarkText
                ? 'rgba(255,255,255,0.14)'
                : 'rgba(0,0,0,0.08)',
            color: hasImage ? '#143025' : isDarkText ? '#9DB6A0' : slide.accent,
          }}
        >
          <span className="min-w-0 truncate">{slide.tag}</span>
        </div>
      )}
      <div className="relative">
        <h2
          className="mb-1 line-clamp-2 whitespace-pre-line text-[21px] leading-[1.1] tracking-[-0.025em] sm:mb-2.5 sm:text-[32px] sm:leading-[1.05] lg:text-5xl"
          style={{ color: textColor }}
        >
          {slide.title}
        </h2>
        {slide.sub && (
          // 노출은 래퍼가, 줄 상한은 <p> 가 맡는다. 둘을 한 요소에 얹으면 hidden/block 의 display 가
          // line-clamp 의 -webkit-box 를 덮어 상한이 풀린다(부제가 조용히 2줄로 늘어난다).
          // md 미만에서 접는다 — 그 구간의 배너는 185~258px 인데 하단 컨트롤 밴드까지 비워야 해서
          // 태그·2줄 제목·CTA 만으로 이미 꽉 찬다. md 부터 배너가 커지고 밴드도 우측으로 빠진다.
          <div className="hidden md:block">
            <p
              className="mb-2 line-clamp-1 max-w-[460px] text-[12.5px] leading-[1.4] sm:mb-3 sm:text-[15.5px] sm:leading-[1.5] lg:mb-5"
              style={{ color: textColor, opacity: 0.85 }}
            >
              {slide.sub}
            </p>
          </div>
        )}
        {slide.cta && (
          <span
            className="btn rounded-md px-4 py-2 text-[13px] font-bold sm:px-[22px] sm:py-3 sm:text-[15px]"
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

  // 외부 URL(http/https)만 anchor 로, 내부 경로(/...)만 Link 로 렌더한다.
  // javascript:/data: 등 안전하지 않은 값은 어느 분기에도 걸리지 않아 비인터랙티브로 폴백한다.
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
  // href === null → Spec #7 의 비인터랙티브 컨테이너 (role/tab/cursor 모두 비활성).
  return <div className="block h-full cursor-default">{body}</div>;
}
