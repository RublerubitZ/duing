'use client';

import { useState } from 'react';
import { useClubNoticeDetailQuery, useClubNoticeListQuery, useRemoveClubNoticeMutation } from '@duing/hooks';
import type { NoticeCardItem } from '@duing/types';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
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
  const [deleting, setDeleting] = useState<NoticeCardItem | null>(null);
  // 목록 카드에는 content 가 없으므로, 수정 시 상세를 시드해야 본문 재입력 없이 편집할 수 있다.
  const { data: editingDetail } = useClubNoticeDetailQuery(clubId, editing?.id ?? null);

  if (isLoading) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-6">
        <ListRowsSkeleton rows={4} rowClassName="h-[88px] rounded-xl" label="공지 불러오는 중" />
      </section>
    );
  }

  const notices = data?.content ?? [];

  const confirmDelete = () => {
    if (!deleting) return;
    removeMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
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
              onDelete={() => setDeleting(notice)}
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
      {editing && editingDetail && (
        <ClubNoticeFormModal
          key={editing.id}
          mode="edit"
          clubId={clubId}
          noticeId={editing.id}
          defaultValues={{
            title: editingDetail.title,
            content: editingDetail.content,
            summary: editingDetail.summary,
            coverImageUrl: editingDetail.coverImageUrl,
            pinned: editingDetail.pinned,
            expiresAt: editingDetail.expiresAt ?? undefined,
          }}
          defaultContentFormat={editingDetail.contentFormat}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="공지를 삭제할까요?"
        description={deleting ? `"${deleting.title}" 공지가 더 이상 노출되지 않습니다.` : undefined}
        isPending={removeMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
