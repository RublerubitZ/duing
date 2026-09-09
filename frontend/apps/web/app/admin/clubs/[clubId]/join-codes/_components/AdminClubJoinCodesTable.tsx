'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ApiError } from '@duing/api';
import { useAdminClubJoinCodesQuery, useForceRevokeAdminClubJoinCodeMutation } from '@duing/hooks';
import type { AdminClubJoinCode } from '@duing/types';

import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { CopyButton } from '@/app/_components/CopyButton';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { cn } from '@/app/_lib/cn';
import { joinLinkUrl } from '@/app/_lib/joinLinkUrl';
import { ConsoleCard } from '@/app/admin/_components/ConsoleCard';
import { EmptyState } from '@/app/admin/_components/EmptyState';
import { ErrorState } from '@/app/admin/_components/ErrorState';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import {
  JOIN_CODE_STATUS_BADGE_CLASS,
  JOIN_CODE_STATUS_LABEL,
  joinCodeAutoApproveLabel,
  joinCodeDateTimeLabel,
  joinCodeKindLabel,
} from '../_lib/joinCodeLabels';

const REASON_MAX_LENGTH = 500;

type Props = {
  clubId: number;
  /** 활동 이력에서 "링크 보기"로 넘어온 링크. 목록에 없으면 조용히 무시한다. */
  highlightJoinCodeId?: number | null;
};

/** 이미 다른 총동연이 끊었거나 링크가 사라진 경우 등 사유가 여러 갈래라 서버 문구를 그대로 쓴다. */
function revokeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return '가입 링크를 폐기하지 못했어요. 잠시 후 다시 시도해주세요.';
}

/**
 * 총동연 가입 링크 목록. 폐기·만료·소진된 링크까지 전부 실린 이력이라 페이지네이션·필터가 없다.
 * 표 자체가 넓어 가로 스크롤은 표 컨테이너 안에서만 일어난다(본문은 가로로 밀리지 않는다).
 */
export function AdminClubJoinCodesTable({ clubId, highlightJoinCodeId = null }: Props) {
  const joinCodesQuery = useAdminClubJoinCodesQuery(clubId);
  const forceRevoke = useForceRevokeAdminClubJoinCodeMutation(clubId);
  const { addToast } = useToast();

  const [revokeTarget, setRevokeTarget] = useState<AdminClubJoinCode | null>(null);
  const [reason, setReason] = useState('');
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  // 강조 행으로의 스크롤은 첫 도착 때 한 번만 — 강제 폐기 뒤 refetch 마다 다시 튀면 안 된다.
  const hasScrolledToHighlightRef = useRef(false);

  const joinCodes = joinCodesQuery.data ?? [];

  useEffect(() => {
    // 목록이 도착한 뒤에야 강조 행이 존재한다. jsdom 에는 scrollIntoView 가 없어 있을 때만 부른다.
    if (hasScrolledToHighlightRef.current || highlightRowRef.current === null) return;
    hasScrolledToHighlightRef.current = true;
    highlightRowRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [joinCodesQuery.data, highlightJoinCodeId]);

  function closeDialog() {
    setRevokeTarget(null);
    setReason('');
  }

  function confirmRevoke() {
    if (revokeTarget === null) return;
    forceRevoke.mutate(
      { joinCodeId: revokeTarget.joinCodeId, payload: { reason: reason.trim() } },
      {
        onSuccess: () => {
          addToast('가입 링크를 폐기했어요');
          closeDialog();
        },
        // 실패해도 닫지 않는다 — 사유를 다시 치게 만들지 않고 그 자리에서 재시도할 수 있다.
        onError: (error) => addToast(revokeErrorMessage(error), { variant: 'error' }),
      },
    );
  }

  if (joinCodesQuery.isLoading) {
    return <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="가입 링크 조회 중" />;
  }

  if (joinCodesQuery.isError) {
    return (
      <ConsoleCard>
        <ErrorState
          message="가입 링크를 불러오지 못했어요."
          onRetry={() => void joinCodesQuery.refetch()}
        />
      </ConsoleCard>
    );
  }

  if (joinCodes.length === 0) {
    return (
      <ConsoleCard>
        <EmptyState
          icon="🔗"
          title="발급된 가입 링크가 없어요"
          body={'이 동아리가 만든 모집 가입 링크·부원 초대 링크가 아직 없습니다.'}
        />
      </ConsoleCard>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[1080px] text-[13px]">
          <caption className="sr-only">가입 링크 목록</caption>
          <thead className="bg-graysoft text-charcoal-2">
            <tr>
              <Th>종류</Th>
              <Th>링크</Th>
              <Th>상태</Th>
              <Th>사용</Th>
              <Th>자동승인</Th>
              <Th>만료</Th>
              <Th>발급</Th>
              <Th>폐기</Th>
              <Th>작업</Th>
            </tr>
          </thead>
          <tbody>
            {joinCodes.map((joinCode) => {
              const highlighted = joinCode.joinCodeId === highlightJoinCodeId;
              return (
                <tr
                  key={joinCode.joinCodeId}
                  ref={highlighted ? highlightRowRef : undefined}
                  data-highlighted={highlighted ? 'true' : undefined}
                  className={cn(
                    'border-t border-line hover:bg-graysoft/50',
                    highlighted && 'bg-sage-tint ring-2 ring-inset ring-ink',
                  )}
                >
                  <Td>{joinCodeKindLabel(joinCode)}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <span className="tabular-nums font-semibold tracking-wide text-ink-deep">
                        {joinCode.code}
                      </span>
                      <CopyButton label="링크 복사" value={joinLinkUrl(joinCode.code)} />
                    </div>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-semibold',
                        JOIN_CODE_STATUS_BADGE_CLASS[joinCode.status],
                      )}
                    >
                      {JOIN_CODE_STATUS_LABEL[joinCode.status]}
                    </span>
                  </Td>
                  <Td>
                    <span className="tabular-nums">
                      {joinCode.usedCount}/{joinCode.maxUses}
                    </span>
                    <span className="ml-1 text-charcoal-3">· 대기 {joinCode.pendingCount}건</span>
                  </Td>
                  <Td>{joinCodeAutoApproveLabel(joinCode)}</Td>
                  <Td>{joinCodeDateTimeLabel(joinCode.joinExpiresAt)}</Td>
                  <Td>
                    <span>{joinCode.createdByName ?? '탈퇴한 회원'}</span>
                    <span className="ml-1 text-charcoal-3">
                      · {joinCodeDateTimeLabel(joinCode.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    {joinCode.revokedAt === null ? (
                      <span className="text-charcoal-3">-</span>
                    ) : (
                      <>
                        <span>{joinCode.revokedByName ?? '탈퇴한 회원'}</span>
                        <span className="ml-1 text-charcoal-3">
                          · {joinCodeDateTimeLabel(joinCode.revokedAt)}
                        </span>
                      </>
                    )}
                  </Td>
                  <Td>
                    {/* 끊을 수 있는 건 활성 링크뿐이다 — 판정은 서버 상태만 본다. */}
                    {joinCode.status === 'ACTIVE' && (
                      <button
                        type="button"
                        aria-label={`${joinCodeKindLabel(joinCode)} 링크 강제 폐기`}
                        onClick={() => {
                          setRevokeTarget(joinCode);
                          setReason('');
                        }}
                        className="btn btn-sm text-coral hover:bg-coral/5"
                      >
                        강제 폐기
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="가입 링크를 폐기할까요?"
        description={
          revokeTarget === null
            ? undefined
            : `${joinCodeKindLabel(revokeTarget)} · 폐기하면 이 링크로는 더 이상 가입할 수 없습니다. 이미 접수된 요청은 그대로 남습니다.`
        }
        confirmLabel="강제 폐기"
        isPending={forceRevoke.isPending}
        confirmDisabled={reason.trim() === ''}
        onConfirm={confirmRevoke}
        onCancel={closeDialog}
      >
        <div>
          <label
            htmlFor="join-code-revoke-reason"
            className="mb-1.5 block text-[12.5px] font-semibold text-charcoal-2"
          >
            폐기 사유 (필수)
          </label>
          <textarea
            id="join-code-revoke-reason"
            value={reason}
            aria-describedby="join-code-revoke-reason-hint"
            // maxLength 는 타이핑·붙여넣기만 끊는다. 드래그-드롭 삽입·자동입력도 상한을 지키도록 값 자체를 자른다.
            onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX_LENGTH))}
            disabled={forceRevoke.isPending}
            rows={4}
            placeholder="예) 유출 신고가 접수돼 링크를 차단"
            className="min-h-[72px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none"
          />
          <div
            id="join-code-revoke-reason-hint"
            className="mt-1 flex items-center justify-between gap-2 text-[11px] text-charcoal-3"
          >
            <span>입력한 사유는 동아리 활동 이력에 기록됩니다.</span>
            <span>
              {reason.length}/{REASON_MAX_LENGTH}
            </span>
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="px-3 py-2 text-left font-semibold">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-middle">{children}</td>;
}
