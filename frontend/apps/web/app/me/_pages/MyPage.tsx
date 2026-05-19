'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { HomeNav } from '../../_components/HomeNav';
import { MY_SECTIONS, type SectionId } from '../_constants/mock';
import { MyPageHeader } from '../_components/MyPageHeader';
import { MyPageTabs } from '../_components/MyPageTabs';
import { SectionNotify } from '../_components/sections/SectionNotify';
import { SectionApply } from '../_components/sections/SectionApply';
import { SectionJoined } from '../_components/sections/SectionJoined';
import { SectionSaved } from '../_components/sections/SectionSaved';
import { SectionActivity } from '../_components/sections/SectionActivity';
import { SectionSettingsSummary } from '../_components/sections/SectionSettingsSummary';

export function MyPage() {
  const router = useRouter();
  const [active, setActive] = useState<SectionId>('notify');
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement>>>({});
  const programmaticScroll = useRef(false);
  const scrollTimerRef = useRef<number>(0);

  const scrollToSection = useCallback((id: SectionId) => {
    const el = sectionRefs.current[id];
    if (!el) return;

    programmaticScroll.current = true;
    setActive(id);

    const TAB_OFFSET = 56;
    const GAP = 8;

    const titleEl = el.querySelector('[data-section-title]') ?? el;
    const titleRect = titleEl.getBoundingClientRect();
    const delta = titleRect.top - (TAB_OFFSET + GAP);
    const top = Math.max(0, window.scrollY + delta);

    window.scrollTo({ top, behavior: 'smooth' });

    window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      programmaticScroll.current = false;
    }, 700);
  }, []);

  useEffect(() => {
    const TAB_OFFSET = 72;
    let raf = 0;

    const compute = () => {
      raf = 0;
      if (programmaticScroll.current) return;

      let activeId: SectionId = MY_SECTIONS[0].id;
      for (const section of MY_SECTIONS) {
        const el = sectionRefs.current[section.id];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - TAB_OFFSET <= 1) {
          activeId = section.id;
        } else {
          break;
        }
      }

      const docHeight = document.documentElement.scrollHeight;
      if (window.scrollY + window.innerHeight >= docHeight - 4) {
        activeId = MY_SECTIONS[MY_SECTIONS.length - 1].id;
      }

      setActive((prev) => (prev === activeId ? prev : activeId));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(compute);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    compute();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const refFor = (id: SectionId) => (el: HTMLDivElement | null) => {
    if (el) sectionRefs.current[id] = el;
  };

  const handleGoToSettings = () => {
    router.push('/me/settings');
  };

  return (
    <div className="bg-cream min-h-screen">
      <HomeNav />
      <MyPageHeader />
      <MyPageTabs active={active} onSelect={scrollToSection} />

      <div ref={refFor('notify')}><SectionNotify /></div>
      <div ref={refFor('apply')}><SectionApply /></div>
      <div ref={refFor('joined')}><SectionJoined /></div>
      <div ref={refFor('saved')}><SectionSaved /></div>
      <div ref={refFor('activity')}><SectionActivity /></div>
      <div ref={refFor('settings')}>
        <SectionSettingsSummary onGoToSettings={handleGoToSettings} />
      </div>
    </div>
  );
}
