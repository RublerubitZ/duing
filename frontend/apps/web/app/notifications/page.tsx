'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import {
  daysUntilKst,
  useNotificationListQuery,
  useNotificationSourceAwareReadMutation,
  useNotificationReadAllMutation,
} from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { Notification } from '@duing/types';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { Spinner } from '@/components/loading/Spinner';
import { toLinkRoute, toRoute } from '../_lib/route';
import { NotificationItem } from '../_components/NotificationItem';

export default function NotificationsPage() {
  const authStatus = useSeededAuthStatus();
  // 이동은 되돌릴 수 없는 부수효과라 확정 신호로만 건다(화면 분기는 아래 status 가 그대로 한다).
  const isSessionEndConfirmed = useAuthStore(
    (state) => state.isVerified && state.status === 'unauthenticated',
  );
  const router = useGuardedRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const listQuery = useNotificationListQuery(unreadOnly, authStatus === 'authenticated');
  const readMutation = useNotificationSourceAwareReadMutation();
  const readAllMutation = useNotificationReadAllMutation();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 종료가 확정된 사용자만 자동으로 보낸다. 시드된 미인증만으로 보내면, 로컬 이력이 지워졌을
    // 뿐 세션은 살아 있는 사용자가 로그인 화면에 방치된다(로그인 페이지에는 되돌려 보내는 장치가
    // 없다) — 그 사이 화면은 아래 로그인 안내를 그리고, 부트스트랩이 세션을 복원하면 목록으로
    // 전환된다.
    if (isSessionEndConfirmed) {
      router.replace('/login?next=/notifications');
    }
  }, [isSessionEndConfirmed, router]);

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

  // 확인이 끝나지 않았어도 로그인 진입점을 준다 — 갱신이 401 이 아닌 이유(5xx·타임아웃·오프라인)로
  // 실패하면 확정 신호가 영영 서지 않아, 대기 화면만 두면 익명 방문자가 무한 스피너에 갇힌다.
  if (authStatus !== 'authenticated') {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="space-y-3 text-sm text-charcoal-2">
          <p>알림은 로그인 후 확인할 수 있어요.</p>
          <Link href={toRoute('/login?next=/notifications')} className="btn btn-primary inline-flex">
            로그인하기
          </Link>
        </div>
      </main>
    );
  }

  const allNotifications = listQuery.data?.pages.flatMap((page) => page.content) ?? [];
  const bucketed = groupByTimeBucket(allNotifications);

  const handleClick = (notification: Notification) => {
    readMutation.mutate({ source: notification.source, id: notification.id });
    const destination = toLinkRoute(notification.linkUrl);
    if (destination) router.push(destination);
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">알림</h1>
        <button
          type="button"
          onClick={() => readAllMutation.mutate()}
          disabled={readAllMutation.isPending}
          className="text-sm text-slate-500 hover:text-slate-900 disabled:opacity-50"
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
      {listQuery.isLoading ? (
        <ListRowsSkeleton rows={6} rowClassName="h-[76px] rounded-xl" label="알림 목록 불러오는 중" />
      ) : allNotifications.length === 0 ? (
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
        <div role="status" aria-label="다음 알림 불러오는 중" className="flex justify-center py-4">
          <Spinner size={18} className="text-charcoal-3" />
        </div>
      )}
    </main>
  );
}

type GroupProps = {
  title: string;
  items: Notification[];
  onClick: (notification: Notification) => void;
};

function NotificationGroup({ title, items, onClick }: GroupProps) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold tracking-[0.04em] text-charcoal-3">{title}</h2>
      <ul className="space-y-1.5">
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

// KST 캘린더 기준 버킷: 오늘(0일) / 이번 주(1~7일 전) / 이전. 미래 시각(서버 시계 편차)은 오늘로.
function groupByTimeBucket(items: Notification[]): TimeBuckets {
  const now = new Date();
  const buckets: TimeBuckets = { today: [], thisWeek: [], older: [] };
  for (const item of items) {
    const daysAgo = -daysUntilKst(item.createdAt, now);
    if (daysAgo <= 0) {
      buckets.today.push(item);
    } else if (daysAgo <= 7) {
      buckets.thisWeek.push(item);
    } else {
      buckets.older.push(item);
    }
  }
  return buckets;
}
