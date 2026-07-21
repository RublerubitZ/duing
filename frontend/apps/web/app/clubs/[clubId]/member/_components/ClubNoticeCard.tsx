'use client';

import Link from 'next/link';
import { formatDateTimeKst } from '@duing/hooks';
import type { NoticeCardItem } from '@duing/types';
import { toRoute } from '@/app/_lib/route';

type Props = {
  clubId: number;
  notice: NoticeCardItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export function ClubNoticeCard({ clubId, notice, canEdit, canDelete, onEdit, onDelete }: Props) {
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={toRoute(`/clubs/${clubId}/member/notices/${notice.id}`)}
          className="flex-1 hover:text-ink"
        >
          <div className="flex items-center gap-2">
            {notice.pinned && (
              <span className="rounded-full bg-warm/20 px-2 py-0.5 text-xs font-semibold text-warm">고정</span>
            )}
            <h3 className="text-base font-semibold text-ink">{notice.title}</h3>
          </div>
          {notice.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-charcoal-2">{notice.summary}</p>
          )}
          <p className="mt-2 text-xs text-charcoal-3">
            {formatDateTimeKst(notice.createdAt)}
          </p>
        </Link>
        {(canEdit || canDelete) && (
          <div className="flex gap-1">
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md px-2 py-1 text-xs text-charcoal-3 hover:bg-graysoft"
              >
                수정
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md px-2 py-1 text-xs text-coral hover:bg-rose-50"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
