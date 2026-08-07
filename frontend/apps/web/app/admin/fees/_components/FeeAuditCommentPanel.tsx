'use client';

import { useState, type FormEvent } from 'react';

import {
  useAdminFeeAuditCommentsQuery,
  useCreateFeeAuditCommentMutation,
  useDeleteFeeAuditCommentMutation,
  useUpdateFeeAuditCommentMutation,
} from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { FeeAuditCommentKind, FeeAuditCommentStatus } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import { FEE_COMMENT_STATUS_LABEL } from '../_lib/feeAuditLabels';
import { FeeFilterChips } from './FeeFilterChips';

/** 서버 검증과 같은 상한(스펙 §7.10). 브라우저가 먼저 막아 2000자 초과 400 을 왕복 없이 없앤다. */
const CONTENT_MAX_LENGTH = 2000;

/** 상태 흐름 순서 그대로 — 전이 제약은 없지만(재오픈 허용) 셀렉트가 진행 순서로 보여야 읽기 쉽다. */
const FEE_COMMENT_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED'] as const;

const KIND_META = {
  AUDIT_OPINION: {
    label: '감사 의견',
    placeholder: '확인이 필요한 사항을 남기면 진행중 상태로 시작합니다.',
    empty: '작성된 감사 의견이 없습니다',
  },
  OPERATION_MEMO: {
    label: '운영 메모',
    placeholder: '나중에 참고할 내용을 남겨 둡니다. 상태 없이 텍스트만 기록됩니다.',
    empty: '작성된 운영 메모가 없습니다',
  },
} satisfies Record<FeeAuditCommentKind, { label: string; placeholder: string; empty: string }>;

const KIND_OPTIONS: { label: string; value?: FeeAuditCommentKind }[] = [
  { label: KIND_META.AUDIT_OPINION.label, value: 'AUDIT_OPINION' },
  { label: KIND_META.OPERATION_MEMO.label, value: 'OPERATION_MEMO' },
];

const selectCls =
  'rounded-md border border-line bg-paper px-2 py-1 text-[11.5px] text-charcoal focus-visible:border-ink focus-visible:outline-none';

/**
 * 의견·메모 탭(스펙 §8.6). 이 콘솔에서 유일하게 쓰기가 있는 화면이지만, 쓰는 대상은 총동연 자신의
 * 감사 기록뿐이다 — 동아리 회계 데이터는 여전히 한 글자도 건드리지 않는다(§1.2).
 *
 * <p>기록은 ADMIN 전용이라 동아리 측 화면에 나가지 않는다(§14 비공개 확정). 그 사실을 상단에 적어 두지 않으면
 * 작성자가 "동아리에 전달된다"고 오해한 채 쓰게 된다.
 *
 * <p>상세 KPI 훅은 여기에 두지 않는다 — 탭마다 부르면 열람 감사 행이 탭을 누른 횟수만큼 늘어난다(§15 결정 5).
 */
export function FeeAuditCommentPanel({ clubId }: { clubId: number }) {
  const { addToast } = useToast();
  const [kind, setKind] = useState<FeeAuditCommentKind>('AUDIT_OPINION');
  const [content, setContent] = useState('');
  /** 삭제 확인은 그 행에서 버튼만 바꿔 받는다 — 네이티브 confirm 은 임베디드 브라우저에서 던진다. */
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const commentsQuery = useAdminFeeAuditCommentsQuery(clubId, kind);
  const createComment = useCreateFeeAuditCommentMutation(clubId);
  const updateComment = useUpdateFeeAuditCommentMutation(clubId);
  const deleteComment = useDeleteFeeAuditCommentMutation(clubId);

  const comments = commentsQuery.data ?? [];
  const trimmedContent = content.trim();
  const meta = KIND_META[kind];

  const notifyFailure = (error: unknown, fallback: string) =>
    addToast(extractErrorMessage(error) ?? fallback, { variant: 'error' });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 공백만 남은 입력은 서버에서도 1자 미만으로 걸린다 — 왕복하지 않고 여기서 끝낸다.
    if (trimmedContent === '' || createComment.isPending) return;
    createComment.mutate(
      // status 를 싣지 않는다: 의견은 서버가 OPEN 으로 시작시키고, 메모에 실어 보내면 400 이다(§7.10).
      { kind, content: trimmedContent },
      {
        onSuccess: () => setContent(''),
        onError: (error) => notifyFailure(error, '기록을 등록하지 못했어요.'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-charcoal-3">
        총동연 내부 기록입니다 — 동아리에는 표시되지 않습니다.
      </p>

      <FeeFilterChips
        ariaLabel="기록 종류"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(next) => {
          // 두 항목 모두 값을 가지므로 '전체'(undefined)로 돌아오는 경로는 없다.
          if (next !== undefined) setKind(next);
        }}
      />

      <ConsoleCard className="p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-charcoal-2">{meta.label} 작성</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={CONTENT_MAX_LENGTH}
              rows={3}
              placeholder={meta.placeholder}
              className="w-full resize-none rounded-lg border border-line px-3 py-2 text-[13px] text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] tabular-nums text-charcoal-3">
              {content.length}/{CONTENT_MAX_LENGTH}
            </span>
            <button
              type="submit"
              disabled={trimmedContent === '' || createComment.isPending}
              className="btn btn-primary btn-sm"
            >
              {createComment.isPending && <ButtonSpinner />}등록
            </button>
          </div>
        </form>
      </ConsoleCard>

      {commentsQuery.isLoading && (
        <ListRowsSkeleton rows={3} rowClassName="h-16 rounded-md" label="의견·메모 조회 중" />
      )}

      {commentsQuery.isError && (
        <ConsoleCard>
          <ErrorState
            message="의견·메모를 불러오지 못했어요."
            onRetry={() => void commentsQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {commentsQuery.isSuccess &&
        (comments.length === 0 ? (
          <ConsoleCard>
            <EmptyState icon="🗒️" title={meta.empty} body="위 입력란에 첫 기록을 남겨 보세요." />
          </ConsoleCard>
        ) : (
          <ConsoleCard>
            <ul aria-label="감사 의견·운영 메모 목록">
              {comments.map((comment) => {
                // 상태는 의견에만 있다 — 메모에 status 를 보내면 서버가 400 으로 막으므로 UI 자체를 두지 않는다.
                const isOpinion = comment.kind === 'AUDIT_OPINION';
                const isConfirmingDelete = pendingDeleteId === comment.commentId;
                return (
                  <li
                    key={comment.commentId}
                    className="border-t border-line px-4 py-3.5 first:border-t-0"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      {isOpinion && comment.status !== null && (
                        <span className="pill-outline inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
                          {FEE_COMMENT_STATUS_LABEL[comment.status]}
                        </span>
                      )}
                      <time
                        dateTime={comment.createdAt}
                        className="whitespace-nowrap tabular-nums text-charcoal-3"
                      >
                        {formatDateTimeKst(comment.createdAt)}
                      </time>
                      {/* 작성자가 탈퇴하면 이름만 비므로 "누군가 사람이 썼다"까지는 남는다. */}
                      <span className="text-charcoal">{comment.authorName ?? '탈퇴 회원'}</span>
                    </div>

                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-ink">
                      {comment.content}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {isOpinion && (
                        <label className="flex items-center gap-1.5 text-[11.5px] text-charcoal-2">
                          <span>상태</span>
                          <select
                            value={comment.status ?? 'OPEN'}
                            onChange={(event) => {
                              const nextStatus: FeeAuditCommentStatus | undefined =
                                FEE_COMMENT_STATUSES.find(
                                  (status) => status === event.target.value,
                                );
                              if (nextStatus === undefined) return;
                              updateComment.mutate(
                                { commentId: comment.commentId, payload: { status: nextStatus } },
                                {
                                  onError: (error) =>
                                    notifyFailure(error, '상태를 바꾸지 못했어요.'),
                                },
                              );
                            }}
                            className={selectCls}
                          >
                            {FEE_COMMENT_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {FEE_COMMENT_STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            disabled={deleteComment.isPending}
                            onClick={() =>
                              deleteComment.mutate(comment.commentId, {
                                onSuccess: () => setPendingDeleteId(null),
                                onError: (error) => notifyFailure(error, '삭제하지 못했어요.'),
                              })
                            }
                            className="btn btn-danger btn-sm"
                          >
                            {deleteComment.isPending && <ButtonSpinner />}정말 삭제
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            className="btn btn-ghost btn-sm"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(comment.commentId)}
                          className="btn btn-ghost btn-sm"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </ConsoleCard>
        ))}
    </div>
  );
}
