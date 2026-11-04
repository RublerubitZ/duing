'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useFavoriteListQuery,
  useMeQuery,
  useMyApplicationsQuery,
  useMyClubsQuery,
  useMyFederationInquiriesQuery,
} from '@duing/hooks';
import type { MyClubSummary } from '@duing/types';

import { HomeNav } from '@/app/_components/HomeNav';
import { ProfileCheckPrompt } from '@/app/_components/ProfileCheckPrompt';
import { useHydrated } from '@/app/_lib/useHydrated';

import { partitionApplications } from '../_lib/partitionApplications';
import {
  SECTION_LABEL,
  SECTION_SHORT_LABEL,
  resolveSectionOrder,
  type SectionId,
} from '../_lib/sectionOrder';

import { AcceptanceBanner } from '../_components/AcceptanceBanner';
import { MyPageHeader } from '../_components/MyPageHeader';
import { MyPageTabs } from '../_components/MyPageTabs';
import { SectionApply } from '../_components/SectionApply';
import { SectionArchived } from '../_components/SectionArchived';
import { SectionInquiries } from '../_components/SectionInquiries';
import { SectionMyClubs } from '../_components/SectionMyClubs';
import { SectionSaved } from '../_components/SectionSaved';

// 조회 중 배너에 넘기는 빈 목록 — 렌더마다 새 배열이면 배너의 메모가 매번 다시 계산된다.
const NO_CLUBS: MyClubSummary[] = [];

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
  const hydrated = useHydrated();

  // 하이드레이션 프레임은 서버처럼 비운다 — 부팅 세션 복원(me 선요청)이 본문보다 먼저 끝나면 첫 렌더가 서버 HTML("—")과 어긋난다.
  const user = hydrated ? meQuery.data : undefined;
  // 결과 없이 종료된 지원(마감 + 미결)은 더 이상 진행 중이 아니므로 지난 지원으로 내린다.
  const { inProgress: applications, archived: archivedApplications } = useMemo(
    () => partitionApplications(applicationsQuery.data ?? []),
    [applicationsQuery.data],
  );
  const myClubs = myClubsQuery.data ?? [];
  const favorites = favoriteListQuery.data?.content ?? [];
  const myInquiries = myInquiriesQuery.data?.content ?? [];
  const myInquiriesTotalCount = myInquiriesQuery.data?.totalElements ?? 0;
  // 조회 중에는 "없음"이 아니라 "아직 모름"이다(#1500) — 정적 HTML·조회 전에 "…없어요"·0 을 그리지 않는다. 하이드레이션
  // 프레임도 서버처럼 조회 중으로 둔다(캐시가 먼저 차 있어도 서버 HTML 의 스켈레톤과 어긋나지 않게).
  const applicationsPending = !hydrated || applicationsQuery.isPending;
  const myClubsPending = !hydrated || myClubsQuery.isPending;
  const favoritesPending = !hydrated || favoriteListQuery.isPending;
  const inquiriesPending = !hydrated || myInquiriesQuery.isPending;

  /* ── 섹션 순서 — 진행 중 지원이 없으면 빈 "지원 현황" 대신 내 동아리를 먼저 보여준다 ── */
  // 로딩 중에는 "0건" 이 아니라 "아직 모름" 이다 — 그대로 0 을 넘기면 pending 동안 joined-first 로 그렸다가
  // 응답이 오는 순간 apply-first 로 뒤집혀 섹션이 통째로 점프한다. 미확정 구간은 1(=기본 apply-first)로 고정하고,
  // 0건이 확정된 뒤에만 재배치한다.
  const order = useMemo(
    () => resolveSectionOrder(applicationsPending ? 1 : applications.length),
    [applicationsPending, applications.length],
  );
  const sections = order.map((id) => ({
    id,
    label: SECTION_LABEL[id],
    shortLabel: SECTION_SHORT_LABEL[id],
  }));

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
    // 탭바 높이가 뷰포트별로 다름(모바일 1줄 py-3 / PC py-4) → 상수 대신 sticky 탭바 실측.
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
      // 탭바 높이는 뷰포트별로 다름 → 상수(72) 대신 실측(비주얼 좌표)에 여유 16 을 더한 기준선.
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

  /* ── 순서가 뒤바뀌는 순간의 활성 탭 보정 ── */
  // 지원 0건이 확정돼 order 가 바뀔 때, 아직 스크롤을 건드리지 않은 사용자는 여전히 맨 위에 있다 —
  // 그 경우에만 활성 탭을 새 첫 섹션으로 맞춘다. 이미 스크롤을 내렸거나 탭을 눌러 이동 중이면
  // 위 스크롤 동기화가 실제 위치로 판단하므로 건드리지 않는다(사용자 선택을 덮지 않기 위함).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || programmaticScroll.current || root.scrollTop > 0) return;
    setActiveTab(order[0]!);
  }, [order]);

  const refFor = (id: SectionId) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current[id] = el;
  };

  /* ── Tabs with live count badges ── */
  // 조회 중인 섹션은 숫자를 숨긴다(탭은 count 가 없으면 배지를 그리지 않는다).
  const sectionCount: Record<SectionId, number | undefined> = {
    apply: applicationsPending ? undefined : applications.length,
    joined: myClubsPending ? undefined : myClubs.length,
    saved: favoritesPending ? undefined : favorites.length,
    inquiries: inquiriesPending ? undefined : myInquiriesTotalCount,
    archived: applicationsPending ? undefined : archivedApplications.length,
  };
  const sectionsWithCount = sections.map((section) => ({ ...section, count: sectionCount[section.id] }));

  return (
    <div
      // body 높이 체인이 없어 height:100% 는 auto 로 붕괴 → 내부 overflow-y-auto 가 스크롤포트를 못 잡음. dvh 로 뷰포트 높이 고정.
      // 모바일에서 탭바 높이를 미리 빼는 이유 — BottomNav 스페이서(h-[calc(60px+env(safe-area-inset-bottom))], md:hidden)가
      // 이 블록 '뒤'에 붙어서, 100dvh 를 그대로 쓰면 문서가 뷰포트보다 60px 길어진다. 그러면 내부 스크롤이 끝에 닿는 순간
      // 스크롤 체이닝으로 문서 전체가 밀려 헤더가 올라가고 고정 탭바 뒤에 빈 띠가 보인다.
      // 두 값은 BottomNav 의 스페이서와 한 쌍이라 한쪽만 바꾸면 어긋난다.
      className="duing flex h-[calc(100dvh_-_60px_-_env(safe-area-inset-bottom))] flex-col overflow-hidden bg-cream md:h-dvh"
    >
      <HomeNav slimOnMobile />

      {/* 아래 여유는 두지 않는다 — 바깥 래퍼가 이미 탭바 높이를 뺀 높이라 스크롤 끝이 탭바 바로 위에서 멈춘다. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <MyPageHeader
          name={user?.name ?? '—'}
          studentId={user?.studentId ?? '—'}
          applyCount={applicationsPending ? null : applications.length}
          joinedCount={myClubsPending ? null : myClubs.length}
          savedCount={favoritesPending ? null : favorites.length}
        />

        <AcceptanceBanner myClubs={myClubsPending ? NO_CLUBS : myClubs} />

        <MyPageTabs
          sections={sectionsWithCount}
          active={activeTab}
          onSelect={scrollToSection}
        />

        {order.map((id) => (
          <div key={id} ref={refFor(id)} data-section={id}>
            {id === 'apply' && <SectionApply applications={applications} isPending={applicationsPending} />}
            {id === 'joined' && <SectionMyClubs myClubs={myClubs} isPending={myClubsPending} />}
            {id === 'saved' && <SectionSaved favorites={favorites} isPending={favoritesPending} />}
            {id === 'inquiries' && (
              <SectionInquiries
                inquiries={myInquiries}
                totalCount={myInquiriesTotalCount}
                isPending={inquiriesPending}
              />
            )}
            {id === 'archived' && (
              <SectionArchived applications={archivedApplications} isPending={applicationsPending} />
            )}
          </div>
        ))}

        {/* 마지막 섹션이 탭 클릭 시 충분히 스크롤될 수 있도록 하는 스페이서 */}
        <div aria-hidden className="shrink-0" style={{ height: 420 }} />
      </div>
      {/* 로그인 기본 착지점(/me)에서도 정보 확인 팝업을 띄운다(스펙 D4) — 포털이라 위치는 레이아웃에 영향이 없다. */}
      <ProfileCheckPrompt />
    </div>
  );
}
