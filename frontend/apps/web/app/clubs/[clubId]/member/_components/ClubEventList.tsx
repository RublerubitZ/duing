'use client';

import { useState } from 'react';
import { useClubEventDetailQuery, useClubEventListQuery, useRemoveClubEventMutation } from '@duing/hooks';
import type { ClubEventCard as Event } from '@duing/types';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
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
  const [deleting, setDeleting] = useState<Event | null>(null);
  // 목록 카드에는 description 이 없으므로, 수정 시 상세를 시드해야 사용자가 기존 설명을 보고 편집/비우기할 수 있다.
  const { data: editingDetail } = useClubEventDetailQuery(clubId, editing?.id ?? null);

  if (isLoading) return <p className="px-6 py-4 text-sm text-charcoal-3">불러오는 중…</p>;

  const confirmDelete = () => {
    if (!deleting) return;
    removeMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
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
              onDelete={() => setDeleting(event)}
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
      {editing && editingDetail && (
        <ClubEventFormModal
          key={editing.id}
          mode="edit"
          clubId={clubId}
          eventId={editing.id}
          defaultValues={{
            title: editingDetail.title,
            description: editingDetail.description ?? '',
            startAt: editingDetail.startAt.slice(0, 16),
            endAt: editingDetail.endAt.slice(0, 16),
            location: editingDetail.location ?? '',
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="일정을 삭제할까요?"
        description={deleting ? `"${deleting.title}" 일정이 더 이상 노출되지 않습니다.` : undefined}
        isPending={removeMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
