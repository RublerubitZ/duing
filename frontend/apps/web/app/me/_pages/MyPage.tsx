'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useFavoriteListQuery, useManagedClubsQuery, useMeQuery, useMyApplicationsQuery } from '@duing/hooks';

import { HomeNav } from '@/app/_components/HomeNav';

import { MyPageHeader } from '../_components/MyPageHeader';
import { MyPageTabs } from '../_components/MyPageTabs';
import { SectionApply } from '../_components/SectionApply';
import { SectionJoined } from '../_components/SectionJoined';
import { SectionSaved } from '../_components/SectionSaved';

type SectionId = 'apply' | 'joined' | 'saved';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'apply', label: '지원 현황' },
  { id: 'joined', label: '가입한 동아리' },
  { id: 'saved', label: '찜한 동아리' },
];

export function MyPage() {
  const [activeTab, setActiveTab] = useState<SectionId>('apply');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement>>>({});
  const programmaticScroll = useRef(false);
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Data ── */
  const meQuery = useMeQuery();
  const applicationsQuery = useMyApplicationsQuery();
  const managedClubsQuery = useManagedClubsQuery();
  const favoriteListQuery = useFavoriteListQuery(0, 20);

  const user = meQuery.data;
  const applications = applicationsQuery.data ?? [];
  const managedClubs = managedClubsQuery.data ?? [];
  const favorites = favoriteListQuery.data?.content ?? [];

  /* ── 탭 클릭 → 해당 섹션 헤더로 스무스 스크롤 ── */
  const scrollToSection = useCallback((id: string) => {
    const root = scrollRef.current;
    const sectionEl = sectionRefs.current[id as SectionId];
    if (!root || !sectionEl) return;

    programmaticScroll.current = true;
    setActiveTab(id as SectionId);

    const TAB_OFFSET = 56;
    const GAP = 8;

    const titleEl = sectionEl.querySelector('[data-section-title]') ?? sectionEl;
    const rootRect = root.getBoundingClientRect();
    const titleRect = titleEl.getBoundingClientRect();

    const scale = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
    const visualDelta = titleRect.top - rootRect.top - (TAB_OFFSET + GAP) * scale;
    const delta = visualDelta / scale;
    const top = Math.max(0, root.scrollTop + delta);

    root.scrollTo({ top, behavior: 'smooth' });

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      programmaticScroll.current = false;
    }, 700);
  }, []);

  /* ── 스크롤 → 활성 탭 동기화 ── */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const TAB_OFFSET = 72;

    const compute = () => {
      rafRef.current = 0;
      if (programmaticScroll.current) return;

      const rootRect = root.getBoundingClientRect();
      const scale = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
      const line = rootRect.top + TAB_OFFSET * scale;

      let nextActive: SectionId = 'apply';
      for (const section of SECTIONS) {
        const el = sectionRefs.current[section.id];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - line <= 1) {
          nextActive = section.id;
        } else {
          break;
        }
      }

      const lastSection = SECTIONS[SECTIONS.length - 1];
      if (lastSection && root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        nextActive = lastSection.id;
      }

      setActiveTab((prev) => (prev === nextActive ? prev : nextActive));
    };

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(compute);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    compute();

    return () => {
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
    };
  }, []);

  const refFor = (id: SectionId) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current[id] = el;
  };

  /* ── Tabs with live count badges ── */
  const sectionsWithCount = SECTIONS.map((section) => {
    const count =
      section.id === 'apply'
        ? applications.length
        : section.id === 'joined'
          ? managedClubs.length
          : favorites.length;
    return { ...section, count };
  });

  return (
    <div
      className="duing bg-cream"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <HomeNav />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <MyPageHeader
          name={user?.name ?? '—'}
          studentId={user?.studentId ?? '—'}
          email={user?.email ?? '—'}
          applyCount={applications.length}
          joinedCount={managedClubs.length}
          savedCount={favorites.length}
        />

        <MyPageTabs
          sections={sectionsWithCount}
          active={activeTab}
          onSelect={scrollToSection}
        />

        <div ref={refFor('apply')} data-section="apply">
          <SectionApply applications={applications} />
        </div>
        <div ref={refFor('joined')} data-section="joined">
          <SectionJoined managedClubs={managedClubs} />
        </div>
        <div ref={refFor('saved')} data-section="saved">
          <SectionSaved favorites={favorites} />
        </div>

        {/* 마지막 섹션이 탭 클릭 시 충분히 스크롤될 수 있도록 하는 스페이서 */}
        <div aria-hidden className="shrink-0" style={{ height: 420 }} />
      </div>
    </div>
  );
}
