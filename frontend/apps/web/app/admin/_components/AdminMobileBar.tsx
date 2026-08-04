'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { skipNextOverlayReclaim } from '@/app/_lib/backDismiss';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ADMIN_SECTIONS } from '../_lib/adminSections';
import { AdminNavContent, resolveActiveSectionHref } from './AdminNavContent';

/**
 * 모바일(md 미만) 어드민 섹션 내비 — 상단바 햄버거로 좌측 Sheet 드로어를 연다.
 * 데스크탑은 AdminSidebar(aside)가 담당하므로 상단바는 md:hidden.
 *
 * 드로어는 SheetPortal 로 .duing 스코프 밖(body)에 렌더되므로, 데스크탑 사이드바와
 * 폰트·헤딩 처리를 맞추기 위해 SheetContent 에 `duing` 클래스를 다시 부여하고
 * 배경만 bg-white(utilities)로 .duing 의 bg-cream 을 덮는다.
 */
export function AdminMobileBar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeHref = resolveActiveSectionHref(pathname);
  const activeTitle = ADMIN_SECTIONS.find((section) => section.href === activeHref)?.title;

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-paper px-4 py-2.5">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="관리 메뉴 열기"
          className="-ml-1 rounded-md p-1 text-ink"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="min-w-0 leading-tight">
          <div className="text-[10.5px] text-charcoal-3">총동연 관리자</div>
          <div className="truncate text-[14px] font-semibold text-ink">
            {activeTitle ?? '관리 콘솔'}
          </div>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          hideClose
          aria-describedby={undefined}
          className="duing w-[82%] max-w-[300px] border-line bg-paper-warm px-3 py-6"
        >
          <SheetTitle className="sr-only">관리 메뉴</SheetTitle>
          {/* 내비 링크(앵커) 클릭 시 드로어를 닫는다. */}
          <div
            onClick={(event) => {
              if (event.target instanceof HTMLElement && event.target.closest('a')) {
                // 링크 이동과 겹치는 닫힘 — 뒤로가기 흡수 엔트리 회수를 건너뛰어 이동이 삼켜지지 않게 한다.
                // 수정자 키 클릭(새 탭)은 이 탭에 이동이 없으므로 평소처럼 회수한다.
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                  skipNextOverlayReclaim();
                }
                setDrawerOpen(false);
              }
            }}
          >
            {/* 드로어는 폭이 충분하므로 접힘을 적용하지 않는다(데스크탑 사이드바 전용 상태). */}
            <AdminNavContent />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
