'use client';

import Link from 'next/link';
import type { NoticeCategory } from '@duing/types';
import { useNoticeListQuery } from '@duing/hooks';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';
import { formatPublishedDate } from '../_lib/eventFormat';
import { toRoute } from '../../_lib/route';

type Props = {
  category: NoticeCategory;
  currentId: number;
};

export function RelatedNotices({ category, currentId }: Props) {
  const listQuery = useNoticeListQuery({ category, page: 0, size: 6 });
  const items = (listQuery.data?.content ?? []).filter((item) => item.id !== currentId).slice(0, 3);

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="text-[12.5px] font-bold text-charcoal-3 mb-1">관련 공지</div>
      <div className="flex flex-col">
        {items.map((item, index) => (
          <Link
            key={item.id}
            href={toRoute(`/notices/${item.id}`)}
            className={`py-3.5 ${index < items.length - 1 ? 'border-b border-line' : ''}`}
          >
            <span className="inline-block mb-1.5 px-2 py-0.5 rounded bg-sage-mist text-ink text-[10.5px] font-bold">
              {NOTICE_CATEGORY_LABEL[item.category]}
            </span>
            <div className="text-[13.5px] font-semibold text-charcoal leading-snug mb-1">{item.title}</div>
            <div className="tabular-nums text-[11.5px] text-charcoal-3">{formatPublishedDate(item.createdAt)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
