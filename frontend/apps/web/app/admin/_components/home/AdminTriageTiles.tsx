'use client';

import Link from 'next/link';
import { useAdminPendingCountsQuery, useAdminTriageQueue } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { ADMIN_TRIAGE_TILES, triageTileHref, triageTileSubline } from './adminTriagePresentation';

export function AdminTriageTiles() {
  const { data: pendingCounts } = useAdminPendingCountsQuery();
  const queue = useAdminTriageQueue();
  const now = new Date();
  // 집계를 받았는데 칸 필드가 없으면 그 항목을 모르는 옛 백엔드다 — 칸을 그리지 않는다(받기 전·실패는 다른 칸처럼 그린다).
  const tiles = ADMIN_TRIAGE_TILES.filter((tile) => pendingCounts === undefined || pendingCounts[tile.countKey] !== undefined);

  return (
    <section aria-label="영역별 대기">
      {/* 한 장의 띠 — 칸 사이 1px 선은 gap-px 자리에서 겹치는 칸 테두리(ring)다. 옛 백엔드라 칸이 7개여도 빈 자리는 흰색으로 남는다. 8칸이 2·4·8열 어디서도 외톨이 칸 없이 찬다(8열은 사이드바 옆 본문이 넓어지는 xl 부터).
          신고 칸은 맨 앞이고 건수가 있으면 경고색이라 폭을 넓히지 않아도 먼저 보인다. 0건은 숫자를 흐리게 해 남은 일이 있는 칸만 눈에 걸린다.
          띠는 아래 카드(.card)와 같은 rounded-lg(20px)이고, 포커스 링은 그 안쪽 모서리(20px − 테두리 1px)와 같은 19px 로 둥글린다 — 각진 링은 네 귀퉁이 칸에서 띠의 둥근 모서리에 잘린다. */}
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-paper lg:grid-cols-4 xl:grid-cols-8">
        {tiles.map((tile) => {
          const count = pendingCounts?.[tile.countKey];
          // 0건에 경고색을 칠하면 경고가 배경이 된다 — 위험 칸도 건수가 있을 때만.
          const isAlert = tile.isDanger && (count ?? 0) > 0;
          const subline = triageTileSubline(
            count,
            tile.key === 'CLUB_APPROVAL' && queue.clubApprovalTimeUnknown ? null : queue.areas[tile.key],
            now,
            tile.todayLabel,
          );
          return (
            <li key={tile.key} className="ring-1 ring-line">
              <Link
                href={toRoute(triageTileHref(tile.key, queue.inquiryTotals))}
                className="flex h-full min-h-11 flex-col gap-1 p-3 transition-colors hover:bg-sage-tint focus-visible:outline-none focus-visible:rounded-[19px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
              >
                <span className={cn('break-keep text-xs font-semibold', isAlert ? 'text-coral-deep' : 'text-charcoal-2')}>
                  {tile.label}
                </span>
                <span
                  className={cn(
                    'min-h-7 text-xl font-bold tabular-nums',
                    isAlert ? 'text-coral-deep' : count === 0 ? 'text-charcoal-3' : 'text-ink',
                  )}
                >
                  {count === undefined ? null : `${count}건`}
                </span>
                <span className="min-h-4 break-keep text-xs text-charcoal-3">
                  {/* 스크린 리더가 대시 하나는 흔히 건너뛴다 — 목록을 받지 못했을 때도, 건수와 받은 목록이 어긋날 때도 가장 오래된 건을 알 수 없다고 말로 읽힌다. */}
                  {subline === '—' ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">가장 오래된 건을 확인할 수 없어요</span>
                    </>
                  ) : (
                    subline
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
