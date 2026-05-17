'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  useNotificationListQuery,
  useNotificationReadMutation,
  useNotificationReadAllMutation,
} from '@duing/hooks';
import type { Notification } from '@duing/types';
import { toLinkRoute } from '../_lib/route';
import { NotificationItem } from './_components/NotificationItem';

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const listQuery = useNotificationListQuery(unreadOnly);
  const readMutation = useNotificationReadMutation();
  const readAllMutation = useNotificationReadAllMutation();
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
        listQuery.fetchNextPage();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [listQuery.hasNextPage, listQuery.isFetchingNextPage, listQuery.fetchNextPage]);

  const allNotifications = listQuery.data?.pages.flatMap((page) => page.content) ?? [];
  const bucketed = groupByTimeBucket(allNotifications);

  const handleClick = (id: number, linkUrl: string | null) => {
    readMutation.mutate(id);
    const destination = toLinkRoute(linkUrl);
    if (destination) router.push(destination);
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">알림</h1>
        <button
          type="button"
          onClick={() => readAllMutation.mutate()}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          모두 읽음
        </button>
      </div>
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setUnreadOnly(false)}
          className={`rounded-full px-3 py-1 text-xs ${!unreadOnly ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          전체
        </button>
        <button
          type="button"
          onClick={() => setUnreadOnly(true)}
          className={`rounded-full px-3 py-1 text-xs ${unreadOnly ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          안 읽음
        </button>
      </div>
      {allNotifications.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">알림이 없어요</p>
      ) : (
        <div className="space-y-6">
          {bucketed.today.length > 0 && (
            <NotificationGroup title="오늘" items={bucketed.today} onClick={handleClick} />
          )}
          {bucketed.thisWeek.length > 0 && (
            <NotificationGroup title="이번 주" items={bucketed.thisWeek} onClick={handleClick} />
          )}
          {bucketed.older.length > 0 && (
            <NotificationGroup title="이전" items={bucketed.older} onClick={handleClick} />
          )}
        </div>
      )}
      <div ref={sentinelRef} className="h-8" />
      {listQuery.isFetchingNextPage && (
        <p className="py-4 text-center text-xs text-slate-400">불러오는 중…</p>
      )}
    </main>
  );
}

type GroupProps = {
  title: string;
  items: Notification[];
  onClick: (id: number, linkUrl: string | null) => void;
};

function NotificationGroup({ title, items, onClick }: GroupProps) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-3">
        {title}
      </h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {items.map((notification) => (
          <li key={notification.id}>
            <NotificationItem notification={notification} onClick={onClick} />
          </li>
        ))}
      </ul>
    </section>
  );
}

type TimeBuckets = {
  today: Notification[];
  thisWeek: Notification[];
  older: Notification[];
};

function groupByTimeBucket(items: Notification[]): TimeBuckets {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const buckets: TimeBuckets = { today: [], thisWeek: [], older: [] };
  for (const item of items) {
    const created = new Date(item.createdAt);
    if (created >= today) {
      buckets.today.push(item);
    } else if (created >= weekAgo) {
      buckets.thisWeek.push(item);
    } else {
      buckets.older.push(item);
    }
  }
  return buckets;
}
