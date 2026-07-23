'use client';

import { useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { ClubHeroActivity } from '@duing/types';
import { HeroActivityCard } from '@/app/_components/HeroActivityCard';
import { cn } from '@/app/_lib/cn';

type Props = { heroActivities: ClubHeroActivity[]; onOpen: (index: number) => void };

/** 학생 화면 모바일 스와이프 래퍼 — scroll-snap 한 장씩, 도트 인디케이터. 배지 없음. */
export function ClubHeroSwipe({ heroActivities, onOpen }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    // 오버스크롤 시 인덱스가 범위를 벗어나 도트가 전멸하지 않게 클램프.
    const page = Math.round(track.scrollLeft / track.clientWidth);
    setCurrentIndex(Math.max(0, Math.min(page, heroActivities.length - 1)));
  }

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    setCurrentIndex(index);
    track.scrollTo({ left: index * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  return (
    <div>
      <div
        ref={trackRef}
        data-testid="hero-swipe-track"
        onScroll={handleScroll}
        // 앵커·이미지 네이티브 드래그가 스와이프를 끊는 레포 전례 가드 — 컨테이너에서 일괄 차단.
        onDragStart={(event) => event.preventDefault()}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none]"
      >
        {heroActivities.map((activity, index) => (
          <button
            key={activity.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`${activity.title} 자세히 보기`}
            className="w-full flex-none snap-center text-left"
          >
            <HeroActivityCard
              imageUrl={activity.storageKey}
              title={activity.title}
              description={activity.description}
            />
          </button>
        ))}
      </div>
      {/* 도트: 시각 6px 유지, 히트 영역은 버튼 패딩으로 확장(WCAG 2.5.8 최소 24px). */}
      <div className="mt-0.5 flex justify-center">
        {heroActivities.map((activity, index) => (
          <button
            key={activity.id}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`${index + 1}번째 대표 활동`}
            aria-current={index === currentIndex || undefined}
            className="px-[3px] py-2.5"
          >
            <span
              className={cn(
                'block h-1.5 rounded-full transition-all',
                index === currentIndex ? 'w-5 bg-ink' : 'w-1.5 bg-line',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
