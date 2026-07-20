'use client';

import Link from 'next/link';
import { formatDateTimeKst } from '@duing/hooks';
import type { ClubEventCard as Event } from '@duing/types';
import { toRoute } from '@/app/_lib/route';

type Props = {
  clubId: number;
  event: Event;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export function ClubEventCard({ clubId, event, canEdit, canDelete, onEdit, onDelete }: Props) {
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={toRoute(`/clubs/${clubId}/member/events/${event.id}`)}
          className="flex-1 hover:text-ink"
        >
          <h3 className="text-base font-semibold text-ink">{event.title}</h3>
          <p className="mt-1 text-sm text-charcoal-2">
            {formatDateTimeKst(event.startAt)} ~ {formatDateTimeKst(event.endAt)}
          </p>
          {event.location && (
            <p className="mt-0.5 text-xs text-charcoal-3">📍 {event.location}</p>
          )}
        </Link>
        {(canEdit || canDelete) && (
          <div className="flex gap-1">
            {canEdit && (
              <button type="button" onClick={onEdit}
                className="rounded-md px-2 py-1 text-xs text-charcoal-3 hover:bg-graysoft">
                수정
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={onDelete}
                className="rounded-md px-2 py-1 text-xs text-coral hover:bg-rose-50">
                삭제
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
