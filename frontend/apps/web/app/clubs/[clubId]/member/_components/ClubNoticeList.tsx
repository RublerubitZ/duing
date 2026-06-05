'use client';

import { useState } from 'react';
import { useClubNoticeListQuery, useRemoveClubNoticeMutation } from '@duing/hooks';
import type { NoticeCardItem } from '@duing/types';
import { useMembership } from './MembershipContext';
import { ClubNoticeCard } from './ClubNoticeCard';
import { ClubNoticeFormModal } from './ClubNoticeFormModal';

type Props = { clubId: number };

export function ClubNoticeList({ clubId }: Props) {
  const { permissions } = useMembership();
  const [page, setPage] = useState(0);
  const { data, isLoading } = useClubNoticeListQuery(clubId, page);
  const removeMutation = useRemoveClubNoticeMutation(clubId);

  const [composeOpen, setComposeOpen] = useState(false);
  const [editing, setEditing] = useState<NoticeCardItem | null>(null);

  if (isLoading) return <p className="px-6 py-4 text-sm text-charcoal-3">불러오는 중…</p>;

  const notices = data?.content ?? [];

  const onDelete = (noticeId: number) => {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;
    removeMutation.mutate(noticeId);
  };

  return (
    <section className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">공지</h2>
        {permissions.canPostNotice && (
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
          >
            공지 작성
          </button>
        )}
      </div>

      {notices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-charcoal-3">
          아직 등록된 공지가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {notices.map((notice) => (
            <ClubNoticeCard
              key={notice.id}
              clubId={clubId}
              notice={notice}
              canEdit={permissions.canEditNotice}
              canDelete={permissions.canDeleteNotice}
              onEdit={() => setEditing(notice)}
              onDelete={() => onDelete(notice.id)}
            />
          ))}
        </ul>
      )}

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-line px-3 py-1 text-sm disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-sm text-charcoal-2">
            {page + 1} / {data.totalPages}
          </span>
          <button
            type="button"
            disabled={!data.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-line px-3 py-1 text-sm disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}

      {composeOpen && (
        <ClubNoticeFormModal
          mode="create"
          clubId={clubId}
          onClose={() => setComposeOpen(false)}
        />
      )}
      {editing && (
        <ClubNoticeFormModal
          mode="edit"
          clubId={clubId}
          noticeId={editing.id}
          defaultValues={{
            title: editing.title,
            content: '',
            summary: editing.summary ?? '',
            pinned: editing.pinned,
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
