'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ManagedClub } from '@duing/types';
import { useManagedClubsQuery } from '@duing/hooks';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ManageGuard } from './ManageGuard';
import { ClubSelector } from './ClubSelector';
import { ManageNav } from './ManageNav';

type ManageShellProps = {
  currentClubId: number | null;
  children: ReactNode;
};

// 사이드바 내용(브랜드·동아리 선택·내비·푸터) — 데스크탑 aside 와 모바일 Sheet 드로어가 공유한다.
// 바깥 컨테이너(aside / SheetContent)가 bg-ink-deep·세로 레이아웃·패딩을 제공한다.
function ManageSidebarContent({
  managedClubs,
  currentClubId,
}: {
  managedClubs: ManagedClub[] | undefined;
  currentClubId: number | null;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-2 pb-3.5 border-b border-white/10">
        <Link href="/" className="block">
          <span className="font-mono font-semibold text-[18px] text-cream tracking-[-0.02em]">
            Du<span className="text-sage">·</span>ing
          </span>
          <span className="block text-[12px] text-cream/50 mt-0.5 ml-0.5">운영진 콘솔</span>
        </Link>
      </div>

      {managedClubs && managedClubs.length > 0 && (
        <>
          <ClubSelector managedClubs={managedClubs} currentClubId={currentClubId} />
          {currentClubId !== null && <ManageNav currentClubId={currentClubId} />}
        </>
      )}

      <div className="mt-auto pt-3 border-t border-white/10 px-2 flex justify-between text-[11.5px] text-cream/50">
        <span>v1.0.0</span>
        <span>회장 모드</span>
      </div>
    </>
  );
}

export function ManageShell({ currentClubId, children }: ManageShellProps) {
  const { data: managedClubs, isLoading } = useManagedClubsQuery();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentClubName = managedClubs?.find((club) => club.clubId === currentClubId)?.clubName;

  return (
    <ManageGuard managedClubs={managedClubs} isLoading={isLoading}>
      <div className="duing flex min-h-dvh">
        {/* 데스크탑 고정 사이드바 (모바일은 드로어로 대체) */}
        <aside className="hidden md:flex w-[248px] shrink-0 flex-col gap-[18px] px-4 py-[22px] pb-6 bg-ink-deep border-r border-black/20">
          <ManageSidebarContent managedClubs={managedClubs} currentClubId={currentClubId} />
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto bg-cream">
          {/* 모바일 상단바 — 햄버거로 드로어 열기 */}
          <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-ink-deep px-4 py-2.5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
              className="-ml-1 rounded-md p-1 text-cream"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div className="min-w-0 leading-tight">
              <div className="text-[10.5px] text-cream/50">운영진 콘솔</div>
              <div className="truncate text-[14px] font-semibold text-cream">{currentClubName ?? 'Du·ing'}</div>
            </div>
          </div>

          {children}
        </main>
      </div>

      {/* 모바일 메뉴 드로어 — 사이드바 내용을 왼쪽 Sheet 로. 링크 클릭/동아리 선택 시 닫힌다. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          hideClose
          aria-describedby={undefined}
          className="flex w-[82%] max-w-[300px] flex-col gap-[18px] border-black/20 bg-ink-deep px-4 py-[22px] pb-6"
        >
          <SheetTitle className="sr-only">운영진 콘솔 메뉴</SheetTitle>
          {/* 닫힘 처리는 SheetContent(Radix) 가 아닌 내부 div(display:contents 라 레이아웃 무영향)에 위임:
              내비 링크 클릭(앵커) 또는 동아리 선택(select change) 시 드로어를 닫는다. */}
          <div
            className="contents"
            onClick={(event) => {
              if (event.target instanceof HTMLElement && event.target.closest('a')) {
                setDrawerOpen(false);
              }
            }}
            onChange={() => setDrawerOpen(false)}
          >
            <ManageSidebarContent managedClubs={managedClubs} currentClubId={currentClubId} />
          </div>
        </SheetContent>
      </Sheet>
    </ManageGuard>
  );
}
