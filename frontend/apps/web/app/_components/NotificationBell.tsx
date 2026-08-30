'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUnreadCountQuery } from '@duing/hooks';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { NotificationSheet } from './NotificationSheet';

// 모바일·태블릿 Link / 데스크탑 button 두 트리거가 공유하는 원형 히트 영역 스타일.
// 가시성(inline-flex lg:hidden / hidden lg:inline-flex)만 각자 덧붙인다.
// 히트 영역은 40px 원을 유지한다(시안 슬롯은 PC 34·모바일 24 로 터치 최소 크기에 못 미친다) — 글리프만 시안 크기다.
const bellButtonClass =
  'relative h-10 w-10 items-center justify-center rounded-full text-ink-deep hover:bg-graysoft 2xl:h-12 2xl:w-12';

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

// 시안(컴포넌트 Frame 33 "icon" 변형)의 Phosphor Bell(Regular) — 30px 그리드 export 패스를 그대로 담았다.
// 크기는 시안대로 모바일 19·PC 24(30×0.815).
function BellIcon() {
  return (
    <svg
      viewBox="0 0 30 30"
      className="h-[19px] w-[19px] md:h-6 md:w-6 2xl:h-[30px] 2xl:w-[30px]"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M25.9922 20.618C25.3418 19.4977 24.375 16.3277 24.375 12.1875C24.375 9.7011 23.3873 7.31653 21.6291 5.55837C19.871 3.80022 17.4864 2.8125 15 2.8125C12.5136 2.8125 10.129 3.80022 8.37087 5.55837C6.61272 7.31653 5.625 9.7011 5.625 12.1875C5.625 16.3289 4.65703 19.4977 4.00664 20.618C3.84055 20.9028 3.7525 21.2264 3.75137 21.5561C3.75024 21.8858 3.83606 22.2099 4.00019 22.4959C4.16432 22.7818 4.40095 23.0195 4.68622 23.1848C4.97148 23.3501 5.29529 23.4373 5.625 23.4375H10.4074C10.6237 24.4959 11.1989 25.4471 12.0358 26.1302C12.8726 26.8133 13.9197 27.1864 15 27.1864C16.0803 27.1864 17.1274 26.8133 17.9642 26.1302C18.8011 25.4471 19.3763 24.4959 19.5926 23.4375H24.375C24.7046 23.4371 25.0283 23.3497 25.3134 23.1843C25.5985 23.0189 25.8349 22.7813 25.9989 22.4954C26.1629 22.2095 26.2486 21.8854 26.2475 21.5558C26.2463 21.2262 26.1582 20.9027 25.9922 20.618ZM15 25.3125C14.4185 25.3123 13.8514 25.1319 13.3767 24.7961C12.902 24.4604 12.543 23.9857 12.3492 23.4375H17.6508C17.457 23.9857 17.098 24.4604 16.6233 24.7961C16.1486 25.1319 15.5815 25.3123 15 25.3125ZM5.625 21.5625C6.52734 20.0109 7.5 16.4156 7.5 12.1875C7.5 10.1984 8.29018 8.29072 9.6967 6.8842C11.1032 5.47768 13.0109 4.6875 15 4.6875C16.9891 4.6875 18.8968 5.47768 20.3033 6.8842C21.7098 8.29072 22.5 10.1984 22.5 12.1875C22.5 16.4121 23.4703 20.0074 24.375 21.5625H5.625Z" />
    </svg>
  );
}
