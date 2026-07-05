'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ApiError } from '@duing/api';
import {
  useDeleteFederationInquiryMutation,
  useFederationInquiryDetailQuery,
  useUpdateFederationInquiryMutation,
} from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { formatDateDot } from '@/app/_lib/formatDateDot';
import { toRoute } from '@/app/_lib/route';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  INQUIRY_STATUS_BADGE_CLASS,
  INQUIRY_STATUS_LABEL,
} from '@/app/_lib/federationInquiryLabels';

const TITLE_MAX_LENGTH = 120;
const CONTENT_MAX_LENGTH = 2000;

type Props = {
  // 라우트 세그먼트가 유효한 양의 안전 정수가 아니면 null (parseInquiryId 참조)
  inquiryId: number | null;
};

export function InquiryDetailPage({ inquiryId }: Props) {
  const isValidId = inquiryId !== null;
  const router = useRouter();
  const { addToast } = useToast();

  const detailQuery = useFederationInquiryDetailQuery(inquiryId);
  const updateMutation = useUpdateFederationInquiryMutation();
  const deleteMutation = useDeleteFederationInquiryMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const inquiry = detailQuery.data;

  if (!isValidId || detailQuery.isError) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="py-12 text-center text-sm text-charcoal-3">문의를 찾을 수 없습니다.</p>
        <p className="text-center">
          <Link
            href={toRoute('/me/inquiries')}
            className="text-sm font-semibold text-ink hover:underline"
          >
            ← 내 문의 목록으로
          </Link>
        </p>
      </main>
    );
  }

  if (detailQuery.isLoading || !inquiry) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="py-12 text-center text-sm text-charcoal-3">불러오는 중…</p>
      </main>
    );
  }

  function startEdit() {
    if (!inquiry) return;
    setEditTitle(inquiry.title);
    setEditContent(inquiry.content);
    setEditError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (inquiryId === null) return;
    setEditError(null);
    try {
      await updateMutation.mutateAsync({
        inquiryId,
        payload: { title: editTitle.trim(), content: editContent.trim() },
      });
      await detailQuery.refetch();
      setIsEditing(false);
    } catch (updateError) {
      if (updateError instanceof ApiError) {
        setEditError(updateError.message || '수정에 실패했습니다.');
        return;
      }
      setEditError('수정에 실패했습니다.');
    }
  }

  async function handleDelete() {
    if (inquiryId === null) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(inquiryId);
      addToast('문의가 삭제되었어요');
      router.replace('/me/inquiries');
    } catch (deleteMutationError) {
      setIsConfirmOpen(false);
      setDeleteError(
        deleteMutationError instanceof ApiError
          ? deleteMutationError.message
          : '삭제에 실패했습니다.',
      );
    }
  }

  const canEdit = inquiry.status === 'RECEIVED';

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={toRoute('/me/inquiries')} className="text-sm text-charcoal-2 hover:text-ink">
        ← 내 문의
      </Link>

      <div className="mt-4 space-y-5">
        {/* 질문 카드 */}
        <section className="rounded-xl border border-line bg-paper p-6">
          {isEditing ? (
            <div className="space-y-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-charcoal-2">제목</span>
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={TITLE_MAX_LENGTH}
                  required
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-charcoal-2">내용</span>
                <textarea
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  maxLength={CONTENT_MAX_LENGTH}
                  required
                  rows={10}
                  className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
                />
              </label>
              {editError && (
                <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral">
                  {editError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={updateMutation.isPending}
                  className="btn btn-ghost btn-sm"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={
                    updateMutation.isPending ||
                    editTitle.trim() === '' ||
                    editContent.trim() === ''
                  }
                  className="btn btn-primary btn-sm"
                >
                  {updateMutation.isPending ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-ink">{inquiry.title}</h1>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    INQUIRY_STATUS_BADGE_CLASS[inquiry.status],
                  )}
                >
                  {INQUIRY_STATUS_LABEL[inquiry.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-charcoal-3">작성 {formatDateDot(inquiry.createdAt)}</p>
              <p className="mt-4 whitespace-pre-wrap text-sm text-ink-deep">{inquiry.content}</p>
            </>
          )}
        </section>

        {/* 상태 안내 */}
        {!isEditing && inquiry.status === 'RECEIVED' && (
          <p className="rounded-[10px] bg-graysoft/60 px-4 py-3 text-sm text-charcoal-2">
            방학 중에는 답변이 지연될 수 있어요
          </p>
        )}
        {!isEditing && inquiry.status === 'IN_PROGRESS' && (
          <p className="rounded-[10px] bg-graysoft/60 px-4 py-3 text-sm text-charcoal-2">
            총동연이 답변을 작성 중이라 수정할 수 없어요
          </p>
        )}
        {!isEditing && inquiry.status === 'CLOSED' && !inquiry.answer && (
          <div className="rounded-[10px] bg-graysoft/60 px-4 py-3 text-sm text-charcoal-2">
            <p>답변 없이 종료된 문의입니다. 필요하면 새 문의를 작성해 주세요.</p>
            {inquiry.closedReason && (
              <p className="mt-1 text-xs text-charcoal-3">종료 사유: {inquiry.closedReason}</p>
            )}
          </div>
        )}

        {/* 답변 카드 */}
        {inquiry.answer && (
          <section className="rounded-xl border border-line bg-graysoft/30 p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink">총동아리연합회</span>
              <span className="text-xs text-charcoal-3">
                답변 {formatDateDot(inquiry.answer.answeredAt)}
              </span>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-ink-deep">{inquiry.answer.content}</p>
          </section>
        )}

        {deleteError && (
          <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral">
            {deleteError}
          </p>
        )}

        {/* 액션 */}
        {!isEditing && (
          <div className="flex items-center justify-end gap-3">
            {canEdit && (
              <button type="button" onClick={startEdit} className="btn btn-secondary btn-sm">
                수정
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsConfirmOpen(true)}
              className="btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f]"
            >
              삭제
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={isConfirmOpen}
        title="문의를 삭제할까요?"
        description="받은 답변도 함께 볼 수 없게 되며 복구할 수 없습니다."
        isPending={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </main>
  );
}
