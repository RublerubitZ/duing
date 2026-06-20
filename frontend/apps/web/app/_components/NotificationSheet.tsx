'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useNotificationListQuery,
  useNotificationSourceAwareReadMutation,
  useNotificationReadAllMutation,
} from '@duing/hooks';
import type { Notification } from '@duing/types';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { X } from '@/components/duing/Icon';
import { toLinkRoute } from '../_lib/route';
import { NotificationItem } from './NotificationItem';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount: number;
};

/**
 * 데스크탑(lg 이상) 전용 우측 알림 패널.
 * 현재 페이지를 유지한 채 최근 알림을 확인하고, 상세 관리는 /notifications 로 넘긴다.
 * 무한 스크롤·읽음 처리는 /notifications 페이지와 동일한 쿼리/뮤테이션을 재사용한다.
 * ESC·바깥 클릭 닫기·포커스 트랩은 Sheet(Radix Dialog)가 제공한다.
 */
export function NotificationSheet({ open, onOpenChange, unreadCount }: Props) {
  const router = useRouter();
  const listQuery = useNotificationListQuery(false, open);
  const readMutation = useNotificationSourceAwareReadMutation();
  const readAllMutation = useNotificationReadAllMutation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!open || !sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const notifications = listQuery.data?.pages.flatMap((page) => page.content) ?? [];

  const handleItemClick = (notification: Notification) => {
    readMutation.mutate({ source: notification.source, id: notification.id });
    onOpenChange(false);
    const destination = toLinkRoute(notification.linkUrl);
    if (destination) router.push(destination);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="duing flex h-full w-[400px] max-w-[90vw] flex-col overflow-hidden bg-cream p-0"
      >
        {/* 상단 — 제목·안읽음 개수·모두 읽음·닫기 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <SheetTitle>알림</SheetTitle>
            {unreadCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
              className="rounded-md px-2 py-1 text-xs font-medium text-charcoal-3 hover:text-ink disabled:opacity-50"
            >
              모두 읽음
            </button>
            <SheetClose
              aria-label="알림 닫기"
              className="rounded-md p-1.5 text-charcoal-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <X size={18} />
            </SheetClose>
          </div>
        </div>

        {/* 본문 — 무한 스크롤 리스트 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-charcoal-3">새 알림이 없어요</p>
          ) : (
            <ul className="divide-y divide-line">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} onClick={handleItemClick} />
                </li>
              ))}
            </ul>
          )}
          <div ref={sentinelRef} className="h-8" />
          {isFetchingNextPage && (
            <p className="py-4 text-center text-xs text-charcoal-3">불러오는 중…</p>
          )}
        </div>

        {/* 하단 — 전체 알림 페이지로 */}
        <div className="shrink-0 border-t border-line px-5 py-3">
          <Link
            href="/notifications"
            onClick={() => onOpenChange(false)}
            className="block rounded-lg py-2 text-center text-sm font-medium text-ink hover:bg-graysoft"
          >
            전체 알림 보기
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
