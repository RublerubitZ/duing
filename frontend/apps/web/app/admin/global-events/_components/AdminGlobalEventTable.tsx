'use client';

import Link from 'next/link';
import { formatDateTimeKst } from '@duing/hooks';
import type { AdminGlobalEventSummary } from '@duing/types';
import { toRoute } from '../../../_lib/route';
import { GLOBAL_EVENT_CATEGORY_LABEL } from '../_lib/categoryLabels';

type Props = {
  items: AdminGlobalEventSummary[];
  onDeleteClick: (eventId: number, title: string) => void;
};

const formatRange = (startAt: string, endAt: string): string =>
  `${formatDateTimeKst(startAt)} ~ ${formatDateTimeKst(endAt)}`;

export function AdminGlobalEventTable({ items, onDeleteClick }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-charcoal-3 text-[13px]">등록된 이벤트가 없습니다.</p>
    );
  }
  return (
    <div className="border border-line rounded-lg bg-paper overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <thead className="bg-cream-2 text-charcoal-2">
          <tr>
            <th className="px-4 py-3 text-left">카테고리</th>
            <th className="px-4 py-3 text-left">제목</th>
            <th className="px-4 py-3 text-left">기간</th>
            <th className="px-4 py-3 text-left">장소</th>
            <th className="px-4 py-3 w-[140px]">관리</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-line">
              <td className="px-4 py-3 text-charcoal-2">
                {GLOBAL_EVENT_CATEGORY_LABEL[item.category]}
              </td>
              <td className="px-4 py-3 text-ink font-semibold">{item.title}</td>
              <td className="px-4 py-3 text-charcoal-2 tabular-nums text-[12.5px]">
                {formatRange(item.startAt, item.endAt)}
              </td>
              <td className="px-4 py-3 text-charcoal-3">{item.location ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={toRoute(`/admin/global-events/${item.id}/edit`)}
                    className="px-3 py-1 rounded-md border border-line text-[12.5px] text-ink"
                  >
                    수정
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDeleteClick(item.id, item.title)}
                    className="px-3 py-1 rounded-md border border-coral text-[12.5px] text-coral"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
