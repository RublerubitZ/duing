'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from '@/components/duing/Icon';
import { SparkleFull } from '@/components/duing/Sparkle';
import { landingBanners, type LandingBanner } from '../../_mocks';

const AUTOPLAY_INTERVAL_MS = 5_000;

function bannerAt(index: number): LandingBanner | undefined {
  return landingBanners[index % landingBanners.length];
}

export function BannerCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % landingBanners.length);
  }, []);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + landingBanners.length) % landingBanners.length);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(goNext, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, goNext]);

  const activeBanner = bannerAt(activeIndex);
  if (!activeBanner) return null;
  const previewBanners: LandingBanner[] = [bannerAt(activeIndex + 1), bannerAt(activeIndex + 2)].filter(
    (banner): banner is LandingBanner => banner !== undefined,
  );

  return (
    <section className="px-10 pt-2">
      <div className="max-w-layout relative mx-auto">
        <div className="grid gap-4 md:grid-cols-[1fr_340px]">
          <MainSlide banner={activeBanner} />
          <div className="flex flex-col gap-3">
            {previewBanners.map((banner) => (
              <PreviewSlide
                key={banner.id}
                banner={banner}
                onSelect={() =>
                  setActiveIndex(landingBanners.findIndex((b) => b.id === banner.id))
                }
              />
            ))}
          </div>
        </div>

        <div className="mt-[18px] flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            {landingBanners.map((banner, idx) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`배너 ${idx + 1}로 이동`}
                onClick={() => setActiveIndex(idx)}
                className={`h-[5px] rounded-full transition-all ${
                  idx === activeIndex ? 'w-6 bg-ink' : 'w-[5px] bg-line'
                }`}
              />
            ))}
          </div>
          <span className="ml-1 font-mono text-xs text-charcoal-3">
            {String(activeIndex + 1).padStart(2, '0')} /{' '}
            {String(landingBanners.length).padStart(2, '0')}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setIsPlaying((prev) => !prev)}
            className="btn btn-ghost btn-sm gap-1"
          >
            <span className="text-sm">{isPlaying ? '⏸' : '▶'}</span>
            <span className="text-xs">{isPlaying ? '자동재생 중' : '정지됨'}</span>
          </button>
          <button
            type="button"
            aria-label="이전 배너"
            onClick={goPrev}
            className="btn btn-secondary grid h-9 w-9 place-items-center rounded-full p-0"
          >
            <ArrowLeft />
          </button>
          <button
            type="button"
            aria-label="다음 배너"
            onClick={goNext}
            className="btn btn-primary grid h-9 w-9 place-items-center rounded-full p-0"
          >
            <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}

function MainSlide({ banner }: { banner: LandingBanner }) {
  const isDarkText = banner.fg === '#fff';
  return (
    <div
      className="relative flex h-[280px] flex-col justify-between overflow-hidden rounded-xl px-12 py-11"
      style={{ background: banner.bg, color: banner.fg }}
    >
      <div
        className="pointer-events-none absolute -right-2.5 -top-5 text-[220px] leading-none opacity-[0.18]"
        style={{ transform: 'rotate(-12deg)' }}
      >
        {banner.emoji}
      </div>
      <SparkleFull
        size={32}
        color={banner.accent}
        className="absolute right-[200px] top-7 opacity-85"
      />
      <SparkleFull
        size={20}
        color={banner.accent}
        className="absolute bottom-12 right-[320px] opacity-50"
      />

      <div
        className="inline-flex items-center gap-2 self-start rounded-full px-3 py-[5px] text-[11.5px] font-extrabold tracking-wide08"
        style={{
          background: isDarkText ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
          color: isDarkText ? '#9DB6A0' : banner.accent,
        }}
      >
        {banner.tag}
      </div>
      <div>
        <h2
          className="mb-2.5 whitespace-pre-line text-5xl leading-[1.05] tracking-[-0.025em]"
          style={{ color: banner.fg }}
        >
          {banner.title}
        </h2>
        <p
          className="mb-6 max-w-[460px] text-[15.5px] leading-[1.5]"
          style={{ color: banner.fg, opacity: 0.78 }}
        >
          {banner.sub}
        </p>
        <button
          type="button"
          className="btn rounded-md px-[22px] py-3 font-bold"
          style={{
            background: isDarkText ? '#9DB6A0' : banner.accent,
            color: isDarkText ? '#143025' : '#fff',
          }}
        >
          {banner.cta}
          <ArrowRight />
        </button>
      </div>
    </div>
  );
}

function PreviewSlide({
  banner,
  onSelect,
}: {
  banner: LandingBanner;
  onSelect(): void;
}) {
  const isDarkText = banner.fg === '#fff';
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative flex-1 cursor-pointer overflow-hidden rounded-lg px-5 py-[18px] text-left"
      style={{ background: banner.bg, color: banner.fg }}
    >
      <div
        className="absolute -right-2.5 -top-2.5 text-[86px] leading-none opacity-[0.22]"
        style={{ transform: 'rotate(-8deg)' }}
      >
        {banner.emoji}
      </div>
      <div
        className="mb-1.5 text-[10.5px] font-extrabold tracking-wide08"
        style={{ color: isDarkText ? '#9DB6A0' : banner.accent }}
      >
        {banner.tag.split(' · ')[0]}
      </div>
      <div
        className="whitespace-pre-line font-display text-[19px] font-bold leading-[1.15]"
        style={{ color: banner.fg }}
      >
        {banner.title}
      </div>
      <div
        className="mt-2 flex items-center gap-1.5 text-xs"
        style={{ color: banner.fg, opacity: 0.7 }}
      >
        {banner.sub.split(' · ')[0]}
        <ArrowRight size={12} />
      </div>
    </button>
  );
}
