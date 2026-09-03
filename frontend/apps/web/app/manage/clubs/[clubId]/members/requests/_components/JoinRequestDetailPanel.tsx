'use client';

import { useState, type ReactNode } from 'react';
import type { JoinRequestDecisionResult } from '@duing/types';
import {
  formatDateTimeKst,
  useDecideJoinRequestMutation,
  useJoinRequestDetailQuery,
} from '@duing/hooks';

import { ButtonSpinner } from '@/components/loading/Spinner';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { X } from '@/components/duing/Icon';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { joinRequestStatusLabel } from '../_lib/joinRequestStatus';

type JoinRequestDetailPanelProps = {
  clubId: number;
  joinRequestId: number;
  onClose: () => void;
  // 처리가 끝나 목록에서 사라질 요청이면 패널도 닫는다(선택 상태 정리는 페이지 몫).
  onDecided: (joinRequestId: number) => void;
};

const EMPTY = '—';

// 자동 거절은 실패가 아니라 "이미 가입돼 있어 인원 차감 없이 정리된" 정상 경로다 — 승인·거절과 구분해 알린다.
const DECISION_MESSAGE: Record<JoinRequestDecisionResult, string> = {
  APPROVED: '가입 요청을 승인했습니다.',
  REJECTED: '가입 요청을 거절했습니다.',
  AUTO_REJECTED: '이미 가입된 회원이라 자동 거절 처리되었습니다.',
  AUTO_REJECTED_WITHDRAWN: '탈퇴한 회원이라 자동 거절 처리되었습니다.',
};

export function JoinRequestDetailPanel({
  clubId,
  joinRequestId,
  onClose,
  onDecided,
}: JoinRequestDetailPanelProps) {
  const detailQuery = useJoinRequestDetailQuery(clubId, joinRequestId);
  const decideJoinRequest = useDecideJoinRequestMutation(clubId);
  const { addToast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const joinRequest = detailQuery.data ?? null;
  const title = joinRequest ? `${joinRequest.userName} 상세` : '가입 요청 상세';

  async function decide(status: 'APPROVED' | 'REJECTED') {
    setError(null);
    try {
      const decision = await decideJoinRequest.mutateAsync({ joinRequestId, payload: { status } });
      addToast(DECISION_MESSAGE[decision.result]);
      onDecided(joinRequestId);
    } catch (decideFailure) {
      // 잔여 인원 부족·이미 처리됨은 409 로 오며 문구가 상황마다 다르다 — 서버 메시지를 그대로 남긴다.
      setError(extractErrorMessage(decideFailure) ?? '가입 요청을 처리하지 못했어요.');
    }
  }

  return (
    <aside aria-label={title} className="card overflow-hidden">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-ink-deep">
            {joinRequest?.userName ?? '가입 요청'}
          </h3>
          {joinRequest && (
            <p className="flex items-center gap-1.5 text-sm text-charcoal-3">
              {joinRequestStatusLabel(joinRequest.status)}
              {/* 운영진 손을 거치지 않고 승인된 요청이라, 표시가 없으면 승인 경위를 알 길이 없다. */}
              {joinRequest.autoApproved && (
                <span className="rounded-full bg-sage-mist px-2 py-0.5 text-xs font-medium text-ink">
                  자동 승인
                </span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-charcoal-3 transition-colors hover:bg-graysoft hover:text-ink"
        >
          <X size={18} />
        </button>
      </header>

      {detailQuery.isLoading && <LoadingGate label="가입 요청 불러오는 중" className="min-h-0 py-10" />}
      {detailQuery.isError && (
        <p role="alert" className="px-5 py-6 text-sm text-coral">
          {extractErrorMessage(detailQuery.error) ?? '가입 요청을 불러오지 못했어요.'}
        </p>
      )}

      {joinRequest && (
        <div className="space-y-5 px-5 py-5">
          <dl className="divide-y divide-line/60">
            <Field label="학번">{joinRequest.studentId || EMPTY}</Field>
            <Field label="학과">{joinRequest.major || EMPTY}</Field>
            {/* 전화번호는 상세 응답에만 담긴다 — 명단 대조용이라 목록에는 내려오지 않는다. */}
            <Field label="연락처">
              <span className="tabular-nums">{joinRequest.phone || EMPTY}</span>
            </Field>
            <Field label="사용 코드">
              <span className="tabular-nums">{joinRequest.code}</span>
            </Field>
            {joinRequest.generation !== null && (
              <Field label="기수">{joinRequest.generation}기</Field>
            )}
            <Field label="요청 일시">{formatDateTimeKst(joinRequest.requestedAt)}</Field>
            {joinRequest.reviewedAt !== null && (
              <Field label="처리 일시">{formatDateTimeKst(joinRequest.reviewedAt)}</Field>
            )}
            {joinRequest.rejectReason !== null && (
              <Field label="거절 사유">{joinRequest.rejectReason}</Field>
            )}
          </dl>

          {error && (
            <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          )}

          {joinRequest.status === 'PENDING' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => decide('APPROVED')}
                disabled={decideJoinRequest.isPending}
                className="btn btn-primary btn-sm flex-1"
              >
                {decideJoinRequest.isPending && <ButtonSpinner />}승인
              </button>
              <button
                type="button"
                onClick={() => decide('REJECTED')}
                disabled={decideJoinRequest.isPending}
                className="btn btn-sm flex-1 text-coral hover:bg-coral/5"
              >
                거절
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-charcoal-3">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink-deep">{children}</dd>
    </div>
  );
}
