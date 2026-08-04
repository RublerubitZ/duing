'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUnreadCountQuery } from '@duing/hooks';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { NotificationSheet } from './NotificationSheet';

// 모바일·태블릿 Link / 데스크탑 button 두 트리거가 공유하는 원형 히트 영역 스타일.
// 가시성(inline-flex lg:hidden / hidden lg:inline-flex)만 각자 덧붙인다.
const bellButtonClass =
  'relative h-10 w-10 items-center justify-center rounded-full hover:bg-graysoft';

export function NotificationBell({
  initialAuthenticated = null,
}: {
  initialAuthenticated?: boolean | null;
} = {}) {
  const isAuthenticated = useSeededAuthStatus(initialAuthenticated) === 'authenticated';
  const [open, setOpen] = useState(false);
  const unreadCountQuery = useUnreadCountQuery(isAuthenticated);

  if (!isAuthenticated) return null;

  const unreadCount = unreadCountQuery.data?.count ?? 0;

  return (
    <>
      {/* 모바일·태블릿(lg 미만): 좁은 화면에선 전체 알림 페이지로 직행 */}
      <Link
        href="/notifications"
        aria-label={`알림 ${unreadCount}개`}
        className={`${bellButtonClass} inline-flex lg:hidden`}
      >
        <BellGlyph unreadCount={unreadCount} />
      </Link>

      {/* 데스크탑(lg 이상): 현재 화면을 유지한 채 우측 알림 패널을 연다 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`알림 ${unreadCount}개`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${bellButtonClass} hidden lg:inline-flex`}
      >
        <BellGlyph unreadCount={unreadCount} />
      </button>

      <NotificationSheet open={open} onOpenChange={setOpen} unreadCount={unreadCount} />
    </>
  );
}

function BellGlyph({ unreadCount }: { unreadCount: number }) {
  return (
    <>
      <BellIcon />
      {unreadCount > 0 && (
        <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
    </svg>
  );
}
