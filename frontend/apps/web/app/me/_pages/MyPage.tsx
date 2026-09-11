'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useFavoriteListQuery,
  useMeQuery,
  useMyApplicationsQuery,
  useMyClubsQuery,
  useMyFederationInquiriesQuery,
} from '@duing/hooks';

import { HomeNav } from '@/app/_components/HomeNav';

import { partitionApplications } from '../_lib/partitionApplications';
import { SECTION_LABEL, resolveSectionOrder, type SectionId } from '../_lib/sectionOrder';

import { AcceptanceBanner } from '../_components/AcceptanceBanner';
import { MyPageHeader } from '../_components/MyPageHeader';
import { MyPageTabs } from '../_components/MyPageTabs';
import { SectionApply } from '../_components/SectionApply';
import { SectionArchived } from '../_components/SectionArchived';
import { SectionInquiries } from '../_components/SectionInquiries';
import { SectionMyClubs } from '../_components/SectionMyClubs';
import { SectionSaved } from '../_components/SectionSaved';

export function MyPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement>>>({});
  const programmaticScroll = useRef(false);
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Data ── */
  const meQuery = useMeQuery();
  // 진행 중/지난 지원 판정에는 지원 상태와 모집 마감 두 축이 함께 필요하다. 서버 scope 는 지원 상태만
  // 보므로 한쪽만 좁히면 어느 배열에도 안 담기는 지원이 생긴다 — 전체를 한 번 받아 여기서 나눈다.
  const applicationsQuery = useMyApplicationsQuery();
  const myClubsQuery = useMyClubsQuery();
  const favoriteListQuery = useFavoriteListQuery(0, 20);
  const myInquiriesQuery = useMyFederationInquiriesQuery({ page: 0, size: 3 });

  const user = meQuery.data;
  // 결과 없이 종료된 지원(마감 + 미결)은 더 이상 진행 중이 아니므로 지난 지원으로 내린다.
  const { inProgress: applications, archived: archivedApplications } = useMemo(
    () => partitionApplications(applicationsQuery.data ?? []),
    [applicationsQuery.data],
  );
  const myClubs = myClubsQuery.data ?? [];
  const favorites = favoriteListQuery.data?.content ?? [];
  const myInquiries = myInquiriesQuery.data?.content ?? [];
  const myInquiriesTotalCount = myInquiriesQuery.data?.totalElements ?? 0;

  /* ── 섹션 순서 — 진행 중 지원이 없으면 빈 "지원 현황" 대신 내 동아리를 먼저 보여준다 ── */
  const order = useMemo(() => resolveSectionOrder(applications.length), [applications.length]);
  const sections = order.map((id) => ({ id, label: SECTION_LABEL[id] }));

  const [activeTab, setActiveTab] = useState<SectionId>(order[0]!);

  /* ── 탭 클릭 → 해당 섹션 헤더로 스무스 스크롤 ── */
  const scrollToSection = useCallback((id: string) => {
    const root = scrollRef.current;
    const sectionEl = sectionRefs.current[id as SectionId];
    if (!root || !sectionEl) return;

    programmaticScroll.current = true;
    setActiveTab(id as SectionId);

    const GAP = 8;

    const titleEl = sectionEl.querySelector('[data-section-title]') ?? sectionEl;
    const rootRect = root.getBoundingClientRect();
    const titleRect = titleEl.getBoundingClientRect();

    const scale = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
    // 탭바가 모바일에서 flex-wrap 으로 2줄이 되어 높이가 반응형으로 달라짐 → 상수 대신 sticky 탭바 실측.
    // getBoundingClientRect() 는 이미 비주얼(시각) 좌표라 실측 높이엔 scale 을 다시 곱하지 않는다(fallback 만 곱).
    const stickyEl = root.querySelector('[data-mypage-tabs]');
    const tabsVisualHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 56 * scale;
    const visualDelta = titleRect.top - rootRect.top - tabsVisualHeight - GAP * scale;
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

    const compute = () => {
      rafRef.current = 0;
      if (programmaticScroll.current) return;

      const rootRect = root.getBoundingClientRect();
      const scale = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
      // 탭바 높이는 모바일 2줄 랩으로 반응형 → 상수(72) 대신 실측(비주얼 좌표)에 여유 16 을 더한 기준선.
      const stickyEl = root.querySelector('[data-mypage-tabs]');
      const tabsVisualHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 56 * scale;
      const line = rootRect.top + tabsVisualHeight + 16 * scale;

      let nextActive: SectionId = order[0]!;
      for (const id of order) {
        const el = sectionRefs.current[id];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - line <= 1) {
          nextActive = id;
        } else {
          break;
        }
      }

      const lastSection = order[order.length - 1];
      if (lastSection && root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        nextActive = lastSection;
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
  }, [order]);

  const refFor = (id: SectionId) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current[id] = el;
  };

  /* ── Tabs with live count badges ── */
  const sectionsWithCount = sections.map((section) => {
    const count =
      section.id === 'apply'
        ? applications.length
        : section.id === 'joined'
          ? myClubs.length
          : section.id === 'saved'
            ? favorites.length
            : section.id === 'inquiries'
              ? myInquiriesTotalCount
              : archivedApplications.length;
    return { ...section, count };
  });

  return (
    <div
      className="duing bg-cream"
      style={{
        // body 높이 체인이 없어 height:'100%'는 auto로 붕괴 → 내부 overflow-y-auto가 스크롤포트를 못 잡음. dvh로 뷰포트 높이 고정.
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <HomeNav slimOnMobile />

      {/* pb — 하단 탭바 스페이서는 root layout(Providers 바깥)에 있어 이 100dvh 스크롤포트에는 닿지 않는다.
          고정 탭바(60 + 세이프에어리어)가 스크롤 끝을 덮으므로 여기서 직접 여유를 준다(md 부터는 탭바가 없다). */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0"
      >
        <MyPageHeader
          name={user?.name ?? '—'}
          studentId={user?.studentId ?? '—'}
          applyCount={applications.length}
          joinedCount={myClubs.length}
          savedCount={favorites.length}
        />

        <AcceptanceBanner myClubs={myClubs} />

        <MyPageTabs
          sections={sectionsWithCount}
          active={activeTab}
          onSelect={scrollToSection}
        />

        {order.map((id) => (
          <div key={id} ref={refFor(id)} data-section={id}>
            {id === 'apply' && <SectionApply applications={applications} />}
            {id === 'joined' && <SectionMyClubs myClubs={myClubs} />}
            {id === 'saved' && <SectionSaved favorites={favorites} />}
            {id === 'inquiries' && (
              <SectionInquiries inquiries={myInquiries} totalCount={myInquiriesTotalCount} />
            )}
            {id === 'archived' && <SectionArchived applications={archivedApplications} />}
          </div>
        ))}

        {/* 마지막 섹션이 탭 클릭 시 충분히 스크롤될 수 있도록 하는 스페이서 */}
        <div aria-hidden className="shrink-0" style={{ height: 420 }} />
      </div>
    </div>
  );
}
