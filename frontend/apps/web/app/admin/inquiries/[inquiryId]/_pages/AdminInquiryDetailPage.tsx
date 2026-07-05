'use client';

import { useState } from 'react';
import Link from 'next/link';

import { ApiError } from '@duing/api';
import {
  useAdminFederationInquiryDetailQuery,
  useAnswerFederationInquiryMutation,
  useChangeFederationInquiryStatusMutation,
  useUpdateFederationInquiryAnswerMutation,
} from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import {
  INQUIRY_STATUS_BADGE_CLASS,
  INQUIRY_STATUS_LABEL,
} from '@/app/_lib/federationInquiryLabels';
import { AdminInquiryCloseDialog } from '../../_components/AdminInquiryCloseDialog';

const ANSWER_MAX_LENGTH = 4000;
// 답변 작성 시작(RECEIVED → IN_PROGRESS) 버전 충돌 시 자동 재시도는 정확히 1회.
const VERSION_CONFLICT_MESSAGE = '문의가 수정되었습니다. 내용을 다시 확인해 주세요.';

type Props = {
  inquiryId: number;
};

export function AdminInquiryDetailPage({ inquiryId }: Props) {
  const { addToast } = useToast();

  const detailQuery = useAdminFederationInquiryDetailQuery(inquiryId);
  const changeStatusMutation = useChangeFederationInquiryStatusMutation();
  const answerMutation = useAnswerFederationInquiryMutation();
  const updateAnswerMutation = useUpdateFederationInquiryAnswerMutation();

  const [isAnswerFormOpen, setIsAnswerFormOpen] = useState(false);
  const [ctaError, setCtaError] = useState<string | null>(null);

  const [answerContent, setAnswerContent] = useState('');
  const [answerError, setAnswerError] = useState<string | null>(null);

  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const [editAnswerContent, setEditAnswerContent] = useState('');
  const [editAnswerError, setEditAnswerError] = useState<string | null>(null);

  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const inquiry = detailQuery.data;

  // RECEIVED → IN_PROGRESS 전환 CTA. 409(version 충돌) 시 최신 detail 을 refetch 해 얻은
  // version 으로 정확히 1회만 자동 재시도한다(암묵적 재시도 금지 — 순차 try/catch 로 명시).
  async function handleStartAnswer() {
    if (!inquiry) return;
    setCtaError(null);

    try {
      await changeStatusMutation.mutateAsync({
        inquiryId,
        payload: { status: 'IN_PROGRESS', version: inquiry.version },
      });
      setIsAnswerFormOpen(true);
      return;
    } catch (firstAttemptError) {
      if (!(firstAttemptError instanceof ApiError) || firstAttemptError.status !== 409) {
        setCtaError(extractErrorMessage(firstAttemptError) ?? '답변 작성 시작에 실패했습니다.');
        return;
      }
    }

    const refreshed = await detailQuery.refetch();
    const freshVersion = refreshed.data?.version;
    if (freshVersion == null) {
      setCtaError(VERSION_CONFLICT_MESSAGE);
      return;
    }

    try {
      await changeStatusMutation.mutateAsync({
        inquiryId,
        payload: { status: 'IN_PROGRESS', version: freshVersion },
      });
      setIsAnswerFormOpen(true);
    } catch {
      setCtaError(VERSION_CONFLICT_MESSAGE);
    }
  }

  async function handleSubmitAnswer() {
    setAnswerError(null);
    try {
      await answerMutation.mutateAsync({ inquiryId, payload: { content: answerContent } });
      addToast('답변이 등록되었어요');
      await detailQuery.refetch();
      setIsAnswerFormOpen(false);
      setAnswerContent('');
    } catch (submitError) {
      // 실패 시 textarea 값은 그대로 유지한다 — 답변 draft 유실 금지.
      setAnswerError(extractErrorMessage(submitError) ?? '답변 등록에 실패했습니다.');
    }
  }

  function startEditAnswer() {
    if (!inquiry?.answer) return;
    setEditAnswerContent(inquiry.answer.content);
    setEditAnswerError(null);
    setIsEditingAnswer(true);
  }

  function cancelEditAnswer() {
    setIsEditingAnswer(false);
    setEditAnswerError(null);
  }

  async function handleUpdateAnswer() {
    setEditAnswerError(null);
    try {
      await updateAnswerMutation.mutateAsync({
        inquiryId,
        payload: { content: editAnswerContent },
      });
      addToast('답변이 수정되었어요');
      await detailQuery.refetch();
      setIsEditingAnswer(false);
    } catch (updateError) {
      setEditAnswerError(extractErrorMessage(updateError) ?? '답변 수정에 실패했습니다.');
    }
  }

  async function handleCloseConfirm(closedReason: string | undefined) {
    setCloseError(null);
    try {
      await changeStatusMutation.mutateAsync({
        inquiryId,
        payload: { status: 'CLOSED', closedReason },
      });
      addToast('문의가 종료되었어요');
      await detailQuery.refetch();
      setIsCloseDialogOpen(false);
    } catch (closeMutationError) {
      setCloseError(extractErrorMessage(closeMutationError) ?? '문의 종료에 실패했습니다.');
    }
  }

  if (detailQuery.isLoading) {
    return (
      <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      </main>
    );
  }

  if (detailQuery.isError || !inquiry) {
    const detailError = detailQuery.error;
    const message =
      detailError instanceof ApiError && detailError.code === 'INQUIRY_DELETED'
        ? '작성자가 삭제한 문의입니다'
        : detailError instanceof ApiError && detailError.status === 404
          ? '문의를 찾을 수 없습니다'
          : '문의 정보를 불러오지 못했습니다.';

    return (
      <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
        <p className="py-12 text-center text-coral text-[13px]">{message}</p>
        <p className="text-center">
          <Link
            href={toRoute('/admin/inquiries')}
            className="text-[13px] font-semibold text-ink hover:underline"
          >
            ← 목록으로
          </Link>
        </p>
      </main>
    );
  }

  const showAnswerForm =
    inquiry.status === 'IN_PROGRESS' || (inquiry.status === 'RECEIVED' && isAnswerFormOpen);
  const canClose = inquiry.status !== 'CLOSED';

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link href={toRoute('/admin/inquiries')} className="text-[13px] text-charcoal-2 hover:text-ink">
          ← 목록으로
        </Link>
        <h1 className="text-[22px] font-bold text-ink">1:1 문의 상세</h1>
      </header>

      <div className="rounded-xl border border-line bg-paper p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-charcoal-2">
            {inquiry.authorName} ({inquiry.authorStudentId})
          </span>
          <span
            className={cn(
              'inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold',
              INQUIRY_STATUS_BADGE_CLASS[inquiry.status],
            )}
          >
            {INQUIRY_STATUS_LABEL[inquiry.status]}
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px]">
          <Row label="작성일">{new Date(inquiry.createdAt).toLocaleString('ko-KR')}</Row>
        </dl>

        <div>
          <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">제목</dt>
          <dd className="text-[13.5px] text-ink">{inquiry.title}</dd>
        </div>

        <div>
          <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">본문</dt>
          <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
            {inquiry.content}
          </dd>
        </div>

        {inquiry.status === 'CLOSED' && inquiry.closedReason && (
          <div className="border-t border-line pt-5">
            <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">종료 사유</dt>
            <dd className="text-[13.5px] text-ink">{inquiry.closedReason}</dd>
          </div>
        )}
      </div>

      {inquiry.answer && !isEditingAnswer && (
        <div className="mt-5 rounded-xl border border-line bg-graysoft/30 p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">답변</span>
            <span className="text-[12px] text-charcoal-3">
              답변일 {new Date(inquiry.answer.answeredAt).toLocaleString('ko-KR')} · 수정일{' '}
              {new Date(inquiry.answer.updatedAt).toLocaleString('ko-KR')}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-[13.5px] text-ink">{inquiry.answer.content}</p>
          {inquiry.status === 'ANSWERED' && (
            <div className="pt-1">
              <button type="button" onClick={startEditAnswer} className="btn btn-secondary btn-sm">
                답변 수정
              </button>
            </div>
          )}
        </div>
      )}

      {inquiry.status === 'ANSWERED' && isEditingAnswer && (
        <div className="mt-5 rounded-xl border border-line bg-paper p-6 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">답변 내용</span>
            <textarea
              value={editAnswerContent}
              onChange={(event) => setEditAnswerContent(event.target.value)}
              maxLength={ANSWER_MAX_LENGTH}
              required
              rows={8}
              className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          {editAnswerError && (
            <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral">
              {editAnswerError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelEditAnswer}
              disabled={updateAnswerMutation.isPending}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleUpdateAnswer}
              disabled={updateAnswerMutation.isPending || editAnswerContent.trim().length === 0}
              className="btn btn-primary btn-sm"
            >
              {updateAnswerMutation.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}

      {inquiry.status === 'RECEIVED' && !isAnswerFormOpen && (
        <div className="mt-5 space-y-3">
          {ctaError && (
            <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral">
              {ctaError}
            </p>
          )}
          <button
            type="button"
            onClick={handleStartAnswer}
            disabled={changeStatusMutation.isPending}
            className="btn btn-primary btn-sm"
          >
            {changeStatusMutation.isPending ? '처리 중…' : '답변 작성'}
          </button>
        </div>
      )}

      {showAnswerForm && (
        <div className="mt-5 rounded-xl border border-line bg-paper p-6 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">답변 내용</span>
            <textarea
              value={answerContent}
              onChange={(event) => setAnswerContent(event.target.value)}
              maxLength={ANSWER_MAX_LENGTH}
              required
              rows={8}
              placeholder="학생에게 전달할 답변을 입력하세요"
              className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          {answerError && (
            <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral">
              {answerError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSubmitAnswer}
              disabled={answerMutation.isPending || answerContent.trim().length === 0}
              className="btn btn-primary btn-sm"
            >
              {answerMutation.isPending ? '등록 중…' : '답변 등록'}
            </button>
          </div>
        </div>
      )}

      {canClose && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setIsCloseDialogOpen(true)}
            disabled={changeStatusMutation.isPending}
            className="btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            종료
          </button>
        </div>
      )}

      {isCloseDialogOpen && (
        <AdminInquiryCloseDialog
          isPending={changeStatusMutation.isPending}
          errorMessage={closeError}
          onConfirm={handleCloseConfirm}
          onCancel={() => {
            setIsCloseDialogOpen(false);
            setCloseError(null);
          }}
        />
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-charcoal-2">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
