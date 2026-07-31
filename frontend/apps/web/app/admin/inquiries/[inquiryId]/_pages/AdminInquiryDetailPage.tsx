'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';

import { ApiError } from '@duing/api';
import {
  formatDateTimeKst,
  useAdminFederationInquiryDetailQuery,
  useAnswerFederationInquiryMutation,
  useChangeFederationInquiryStatusMutation,
  useUpdateFederationInquiryAnswerMutation,
} from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { AttachmentImage } from '@/app/_components/AttachmentImage';
import {
  INQUIRY_STATUS_BADGE_CLASS,
  INQUIRY_STATUS_LABEL,
} from '@/app/_lib/federationInquiryLabels';
import { AdminInquiryCloseDialog } from '../../_components/AdminInquiryCloseDialog';

const ANSWER_MAX_LENGTH = 4000;
// 답변 작성 시작(RECEIVED → IN_PROGRESS)과 접수로 되돌리기(IN_PROGRESS → RECEIVED) 모두
// 버전 충돌 시 자동 재시도는 정확히 1회.
const VERSION_CONFLICT_MESSAGE = '문의가 수정되었습니다. 내용을 다시 확인해 주세요.';

type Props = {
  // 라우트 세그먼트가 유효한 양의 안전 정수가 아니면 null (parseInquiryId 참조)
  inquiryId: number | null;
};

export function AdminInquiryDetailPage({ inquiryId }: Props) {
  const { addToast } = useToast();

  const detailQuery = useAdminFederationInquiryDetailQuery(inquiryId);
  const changeStatusMutation = useChangeFederationInquiryStatusMutation();
  const answerMutation = useAnswerFederationInquiryMutation();
  const updateAnswerMutation = useUpdateFederationInquiryAnswerMutation();

  const [isAnswerFormOpen, setIsAnswerFormOpen] = useState(false);
  const [ctaError, setCtaError] = useState<string | null>(null);

  const [revertError, setRevertError] = useState<string | null>(null);

  const [answerContent, setAnswerContent] = useState('');
  const [answerError, setAnswerError] = useState<string | null>(null);

  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const [editAnswerContent, setEditAnswerContent] = useState('');
  const [editAnswerError, setEditAnswerError] = useState<string | null>(null);

  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const inquiry = detailQuery.data;

  // refetch await 구간에서 isPending 이 잠깐 풀려 버튼이 재활성화되는 좁은 윈도우를 막는 동기 가드.
  const isStartingAnswerRef = useRef(false);
  // 접수로 되돌리기도 동일한 좁은 재활성화 윈도우 문제가 있어 별도 동기 가드를 둔다.
  const isRevertingRef = useRef(false);

  // RECEIVED → IN_PROGRESS 전환 CTA. 409(version 충돌) 시 최신 detail 을 refetch 해 얻은
  // version 으로 정확히 1회만 자동 재시도한다(암묵적 재시도 금지 — 순차 try/catch 로 명시).
  async function handleStartAnswer() {
    if (inquiryId === null || !inquiry) return;
    if (isStartingAnswerRef.current) return;
    isStartingAnswerRef.current = true;
    setCtaError(null);

    try {
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
      // refetch 실패 시 TanStack Query 는 기존 캐시 data 를 유지하므로 isError 를 함께 보지 않으면
      // stale version 으로 재시도하게 된다. refetch 실패는 버전 충돌이 아니라 조회 실패 — 원인 메시지로 종료.
      if (refreshed.isError || freshVersion == null) {
        setCtaError(extractErrorMessage(refreshed.error) ?? '답변 작성 시작에 실패했습니다.');
        return;
      }

      try {
        await changeStatusMutation.mutateAsync({
          inquiryId,
          payload: { status: 'IN_PROGRESS', version: freshVersion },
        });
        setIsAnswerFormOpen(true);
      } catch (retryError) {
        // 재시도 실패도 409(또 수정됨)만 버전 충돌 안내로, 그 외(네트워크·5xx)는 원인 메시지로 구분.
        setCtaError(
          retryError instanceof ApiError && retryError.status === 409
            ? VERSION_CONFLICT_MESSAGE
            : (extractErrorMessage(retryError) ?? '답변 작성 시작에 실패했습니다.'),
        );
      }
    } finally {
      isStartingAnswerRef.current = false;
    }
  }

  // IN_PROGRESS → RECEIVED 역전이 CTA(관리자 방치로 인한 학생 영구 수정 잠금의 수동 탈출구).
  // handleStartAnswer 와 동일하게 409(version 충돌) 시 refetch 로 얻은 fresh version 으로
  // 정확히 1회만 자동 재시도한다.
  async function handleRevertToReceived() {
    if (inquiryId === null || !inquiry) return;
    if (isRevertingRef.current) return;
    isRevertingRef.current = true;
    setRevertError(null);

    try {
      try {
        await changeStatusMutation.mutateAsync({
          inquiryId,
          payload: { status: 'RECEIVED', version: inquiry.version },
        });
        addToast('접수 상태로 되돌렸어요');
        await detailQuery.refetch();
        // answerContent(draft)는 지우지 않는다 — 재진입 시 복원되는 게 낫다.
        setIsAnswerFormOpen(false);
        return;
      } catch (firstAttemptError) {
        if (!(firstAttemptError instanceof ApiError) || firstAttemptError.status !== 409) {
          setRevertError(extractErrorMessage(firstAttemptError) ?? '접수 상태로 되돌리기에 실패했습니다.');
          return;
        }
      }

      const refreshed = await detailQuery.refetch();
      const freshVersion = refreshed.data?.version;
      // refetch 실패 시 TanStack Query 는 기존 캐시 data 를 유지하므로 isError 를 함께 보지 않으면
      // stale version 으로 재시도하게 된다. refetch 실패는 버전 충돌이 아니라 조회 실패 — 원인 메시지로 종료.
      if (refreshed.isError || freshVersion == null) {
        setRevertError(extractErrorMessage(refreshed.error) ?? '접수 상태로 되돌리기에 실패했습니다.');
        return;
      }

      try {
        await changeStatusMutation.mutateAsync({
          inquiryId,
          payload: { status: 'RECEIVED', version: freshVersion },
        });
        addToast('접수 상태로 되돌렸어요');
        // 재시도 성공도 1차 성공과 동일하게 refetch 로 화면을 확정한다 — 409 처리 중의 refetch 는
        // mutation 이전 데이터라 되돌리기 결과(RECEIVED)를 반영하지 못한다.
        await detailQuery.refetch();
        setIsAnswerFormOpen(false);
      } catch (retryError) {
        // 재시도 실패도 409(또 수정됨)만 버전 충돌 안내로, 그 외(네트워크·5xx)는 원인 메시지로 구분.
        setRevertError(
          retryError instanceof ApiError && retryError.status === 409
            ? VERSION_CONFLICT_MESSAGE
            : (extractErrorMessage(retryError) ?? '접수 상태로 되돌리기에 실패했습니다.'),
        );
      }
    } finally {
      isRevertingRef.current = false;
    }
  }

  async function handleSubmitAnswer() {
    if (inquiryId === null || !inquiry) return;
    setAnswerError(null);
    try {
      await answerMutation.mutateAsync({
        inquiryId,
        payload: { content: answerContent, version: inquiry.version },
      });
      addToast('답변이 등록되었어요');
      await detailQuery.refetch();
      setIsAnswerFormOpen(false);
      setAnswerContent('');
    } catch (submitError) {
      // 답변 등록은 내용을 실은 요청이라 409 충돌 = 학생이 그 사이 내용을 바꿨다는 뜻 —
      // 자동 재시도 없이 관리자가 최신 내용을 다시 확인하도록 한다. textarea 값도 유지한다.
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
    if (inquiryId === null) return;
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
    if (inquiryId === null || !inquiry) return;
    setCloseError(null);
    try {
      await changeStatusMutation.mutateAsync({
        inquiryId,
        payload: { status: 'CLOSED', closedReason, version: inquiry.version },
      });
      addToast('문의가 종료되었어요');
      await detailQuery.refetch();
      setIsCloseDialogOpen(false);
    } catch (closeMutationError) {
      // 답변 등록과 같은 이유로 자동 재시도하지 않는다 — 409 는 그 사이 문의가 바뀌었다는 뜻이라
      // 관리자가 최신 상태를 다시 확인한 뒤 재시도해야 한다.
      setCloseError(extractErrorMessage(closeMutationError) ?? '문의 종료에 실패했습니다.');
    }
  }

  if (detailQuery.isLoading) {
    return (
      <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
        <LoadingGate label="문의 불러오는 중" />
      </main>
    );
  }

  if (inquiryId === null || detailQuery.isError || !inquiry) {
    const detailError = detailQuery.error;
    const message =
      inquiryId === null
        ? '문의를 찾을 수 없습니다'
        : detailError instanceof ApiError && detailError.code === 'INQUIRY_DELETED'
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
          <Row label="작성일">{formatDateTimeKst(inquiry.createdAt)}</Row>
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

        {inquiry.attachments.length > 0 && (
          <div>
            <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">첨부 이미지</dt>
            <dd className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {inquiry.attachments.map((attachment) => (
                <AttachmentImage key={attachment.id} inquiryId={inquiry.id} attachment={attachment} />
              ))}
            </dd>
          </div>
        )}

        {inquiry.status === 'CLOSED' && inquiry.closedReason && (
          <div className="pt-5">
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
              답변일 {formatDateTimeKst(inquiry.answer.answeredAt)} · 수정일{' '}
              {formatDateTimeKst(inquiry.answer.updatedAt)}
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
              {updateAnswerMutation.isPending && <ButtonSpinner />}저장
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
            {changeStatusMutation.isPending && <ButtonSpinner />}답변 작성
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
          {inquiry.status === 'IN_PROGRESS' && revertError && (
            <p role="alert" className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral">
              {revertError}
            </p>
          )}
          <div className="flex justify-between">
            <div>
              {inquiry.status === 'IN_PROGRESS' && (
                <button
                  type="button"
                  onClick={handleRevertToReceived}
                  disabled={changeStatusMutation.isPending}
                  className="btn btn-secondary btn-sm"
                >
                  {changeStatusMutation.isPending && <ButtonSpinner />}접수로 되돌리기
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmitAnswer}
              disabled={answerMutation.isPending || answerContent.trim().length === 0}
              className="btn btn-primary btn-sm"
            >
              {answerMutation.isPending && <ButtonSpinner />}답변 등록
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
