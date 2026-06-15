'use client';

import { useState } from 'react';
import { useClubEventListQuery, useRemoveClubEventMutation } from '@duing/hooks';
import type { ClubEventCard as Event } from '@duing/types';
import { useMembership } from './MembershipContext';
import { ClubEventCard } from './ClubEventCard';
import { ClubEventFormModal } from './ClubEventFormModal';

type Props = { clubId: number };

export function ClubEventList({ clubId }: Props) {
  const { permissions } = useMembership();
  const { data: events = [], isLoading } = useClubEventListQuery(clubId);
  const removeMutation = useRemoveClubEventMutation(clubId);

  const [composeOpen, setComposeOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);

  if (isLoading) return <p className="px-6 py-4 text-sm text-charcoal-3">불러오는 중…</p>;

  const onDelete = (eventId: number) => {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    removeMutation.mutate(eventId);
  };

  return (
    <section className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">일정</h2>
        {permissions.canPostEvent && (
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
          >
            일정 추가
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-charcoal-3">
          등록된 일정이 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <ClubEventCard
              key={event.id}
              clubId={clubId}
              event={event}
              canEdit={permissions.canEditEvent}
              canDelete={permissions.canDeleteEvent}
              onEdit={() => setEditing(event)}
              onDelete={() => onDelete(event.id)}
            />
          ))}
        </ul>
      )}

      {composeOpen && (
        <ClubEventFormModal
          mode="create"
          clubId={clubId}
          onClose={() => setComposeOpen(false)}
        />
      )}
      {editing && (
        <ClubEventFormModal
          mode="edit"
          clubId={clubId}
          eventId={editing.id}
          defaultValues={{
            title: editing.title,
            startAt: editing.startAt.slice(0, 16),
            endAt: editing.endAt.slice(0, 16),
            location: editing.location ?? '',
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
