'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useUnreadCountQuery,
  useNotificationListQuery,
  useNotificationSourceAwareReadMutation,
  useNotificationReadAllMutation,
} from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { Notification } from '@duing/types';
import { toLinkRoute } from '../_lib/route';

// 모바일 Link·데스크탑 button 두 트리거가 공유하는 원형 히트 영역 스타일.
// 가시성(inline-flex md:hidden / hidden md:inline-flex)만 각자 덧붙인다.
const bellButtonClass =
  'relative h-10 w-10 items-center justify-center rounded-full hover:bg-graysoft';

export function NotificationBell() {
  const authStatus = useAuthStore((state) => state.status);
  const isAuthenticated = authStatus === 'authenticated';

  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  const unreadCountQuery = useUnreadCountQuery(isAuthenticated);
  const listQuery = useNotificationListQuery(false, isAuthenticated && hasOpened);
  const readMutation = useNotificationSourceAwareReadMutation();
  const readAllMutation = useNotificationReadAllMutation();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!isAuthenticated) return null;

  const unreadCount = unreadCountQuery.data?.count ?? 0;
  const recentFive = (listQuery.data?.pages?.[0]?.content ?? []).slice(0, 5);

  const handleItemClick = (notification: Notification) => {
    readMutation.mutate({ source: notification.source, id: notification.id });
    setOpen(false);
    const destination = toLinkRoute(notification.linkUrl);
    if (destination) router.push(destination);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 모바일: 좁은 화면에선 미리보기 드롭다운 대신 전체 알림 페이지로 직행 */}
      <Link
        href="/notifications"
        aria-label={`알림 ${unreadCount}개`}
        className={`${bellButtonClass} inline-flex md:hidden`}
      >
        <BellGlyph unreadCount={unreadCount} />
      </Link>

      {/* 데스크탑: 벨 클릭 시 최근 5개 미리보기 드롭다운 토글 */}
      <button
        type="button"
        onClick={() => { setHasOpened(true); setOpen((previous) => !previous); }}
        aria-label={`알림 ${unreadCount}개`}
        className={`${bellButtonClass} hidden md:inline-flex`}
      >
        <BellGlyph unreadCount={unreadCount} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 hidden w-80 overflow-hidden rounded-xl border border-line bg-white shadow-lg md:block">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">알림</h3>
            <button
              type="button"
              onClick={() => readAllMutation.mutate()}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              모두 읽음
            </button>
          </div>
          {recentFive.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">새 알림이 없어요</p>
          ) : (
            <ul>
              {recentFive.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(notification)}
                    className="block w-full px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-start gap-2">
                      {!notification.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{notification.title}</p>
                        <p className="truncate text-xs text-slate-500">{notification.body}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t px-4 py-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-slate-700 hover:text-slate-900"
            >
              전체 보기 →
            </Link>
          </div>
        </div>
      )}
    </div>
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
