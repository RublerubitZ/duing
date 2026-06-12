'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import {
  useInterviewRoundDetailQuery,
  useRoundAutoAssignMutation,
  useConfirmRoundMutation,
  useRemindMutation,
  useUpdateInterviewRoundMutation,
  useCancelInterviewRoundMutation,
  useExcludeMemberMutation,
  useAssignMemberScheduleMutation,
} from '@duing/hooks';
import { isUnresolvedMembersPayload } from '@duing/types';
import type { InterviewRoundDetailMember, UnresolvedMembersPayload } from '@duing/types';
import { toRoute } from '@/app/_lib/route';
import { cn } from '@/app/_lib/cn';
import { ConfirmDialog } from './ConfirmDialog';
import { AutoAssignDialog } from './AutoAssignDialog';
import { ConfirmRoundDialog } from './ConfirmRoundDialog';
import { MemberAssignModal } from './MemberAssignModal';
import { ExtendDeadlineModal } from './ExtendDeadlineModal';
import { RoundStatusBanner } from './RoundStatusBanner';
import { RoundCountCards } from './RoundCountCards';
import { RoundMemberTable } from './RoundMemberTable';
import { NoSlotSection } from './NoSlotSection';
import { RoundSlotsSection } from './RoundSlotsSection';

// 라운드 dashboard 컨테이너 — detail 단일 쿼리를 섹션 5종에 분배하고
// 액션 mutation·모달 상태·피드백을 관장한다. 섹션·모달은 같은 _components/ 개별 파일.

type Props = {
  clubId: number;
  recruitmentId: number;
  roundId: number;
};

/** 상단 인라인 피드백 — error 는 rose 스타일, 4초 후 자동 소멸 */
type FeedbackMessage = {
  kind: 'success' | 'error';
  text: string;
};

// ── 제외 확인 모달 (ConfirmDialog 래퍼) ──────────────────────────────────────

type ExcludeDialogProps = {
  memberName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
};

function ExcludeDialog({ memberName, onConfirm, onCancel, isPending }: ExcludeDialogProps) {
  return (
    <ConfirmDialog
      title={`${memberName} 제외`}
      description="제외된 멤버는 대기열로 복귀합니다. 계속하시겠습니까?"
      confirmLabel="확인"
      onConfirm={onConfirm}
      onCancel={onCancel}
      isPending={isPending}
      destructive
    />
  );
}

// ── RoundDashboard ───────────────────────────────────────────────────────────

export function RoundDashboard({ clubId, recruitmentId, roundId }: Props) {
  const detailQuery = useInterviewRoundDetailQuery(roundId);

  // 모달 상태
  const [showAutoAssignDialog, setShowAutoAssignDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showExtendDeadlineModal, setShowExtendDeadlineModal] = useState(false);
  const [excludeTarget, setExcludeTarget] = useState<InterviewRoundDetailMember | null>(null);
  const [assignTarget, setAssignTarget] = useState<InterviewRoundDetailMember | null>(null);
  const [confirmDialogPayload, setConfirmDialogPayload] =
    useState<UnresolvedMembersPayload | null>(null);

  // 모달 내부 에러 — 전역 피드백으로 빠지지 않게 모달별 로컬 상태로 유지
  const [confirmDialogError, setConfirmDialogError] = useState<string | null>(null);
  const [extendDeadlineError, setExtendDeadlineError] = useState<string | null>(null);

  // 인라인 피드백
  const [feedbackMessage, setFeedbackMessage] = useState<FeedbackMessage | null>(null);

  // 피드백 4초 자동 소멸 — 로딩/에러 early return 이전에 선언해 훅 순서 고정
  useEffect(() => {
    if (feedbackMessage === null) return;
    const dismissTimer = setTimeout(() => setFeedbackMessage(null), 4_000);
    return () => clearTimeout(dismissTimer);
  }, [feedbackMessage]);

  // Mutations
  const autoAssignMutation = useRoundAutoAssignMutation(recruitmentId, roundId);
  const confirmMutation = useConfirmRoundMutation(recruitmentId, roundId);
  const remindMutation = useRemindMutation(roundId);
  const updateMutation = useUpdateInterviewRoundMutation(recruitmentId, roundId);
  const cancelMutation = useCancelInterviewRoundMutation(recruitmentId, roundId);
  const excludeMutation = useExcludeMemberMutation(recruitmentId, roundId);
  const assignMutation = useAssignMemberScheduleMutation(roundId);

  if (detailQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  if (detailQuery.isError || !detailQuery.data) {
    const message =
      detailQuery.error instanceof ApiError
        ? detailQuery.error.message
        : '라운드 정보를 불러오지 못했습니다.';
    return <p className="p-6 text-sm text-rose-600">{message}</p>;
  }

  const detail = detailQuery.data;
  const { status, counts } = detail;
  const isNonTerminal = status !== 'SCHEDULED' && status !== 'CANCELLED';

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  const handleAutoAssign = () => {
    setShowAutoAssignDialog(true);
  };

  const handleAutoAssignConfirm = () => {
    autoAssignMutation.mutate(undefined, {
      onSuccess: () => {
        setShowAutoAssignDialog(false);
        setFeedbackMessage({ kind: 'success', text: '자동배정이 완료되었습니다.' });
      },
      onError: (mutationError) => {
        setShowAutoAssignDialog(false);
        const message =
          mutationError instanceof ApiError
            ? mutationError.message
            : '자동배정 중 오류가 발생했습니다.';
        setFeedbackMessage({ kind: 'error', text: message });
      },
    });
  };

  const handleConfirm = () => {
    confirmMutation.mutate(false, {
      onSuccess: (result) => {
        setFeedbackMessage({
          kind: 'success',
          text: `확정 완료 — ${result.assignedMemberCount}명 알림`,
        });
      },
      onError: (confirmError) => {
        if (
          confirmError instanceof ApiError &&
          confirmError.status === 409 &&
          isUnresolvedMembersPayload(confirmError.payload)
        ) {
          setConfirmDialogError(null);
          setConfirmDialogPayload(confirmError.payload);
        } else {
          const message =
            confirmError instanceof ApiError
              ? confirmError.message
              : '확정 중 오류가 발생했습니다.';
          setFeedbackMessage({ kind: 'error', text: message });
        }
      },
    });
  };

  const handleForceConfirm = () => {
    confirmMutation.mutate(true, {
      onSuccess: (result) => {
        setConfirmDialogPayload(null);
        setConfirmDialogError(null);
        setFeedbackMessage({
          kind: 'success',
          text: `확정 완료 — ${result.assignedMemberCount}명 알림`,
        });
      },
      onError: (forceError) => {
        // 모달 내부 alert 로 노출 — 모달 뒤 전역 피드백으로 빠지지 않게
        const message =
          forceError instanceof ApiError
            ? forceError.message
            : '강제 확정 중 오류가 발생했습니다.';
        setConfirmDialogError(message);
      },
    });
  };

  const handleRemind = () => {
    remindMutation.mutate(undefined, {
      onSuccess: (result) => {
        setFeedbackMessage({
          kind: 'success',
          text: `재알림 발송 완료 — ${result.notifiedMemberCount}명`,
        });
      },
      onError: (remindError) => {
        const message =
          remindError instanceof ApiError
            ? remindError.message
            : '재알림 발송 중 오류가 발생했습니다.';
        setFeedbackMessage({ kind: 'error', text: message });
      },
    });
  };

  const handleExtendDeadline = (availabilityDeadline: string) => {
    updateMutation.mutate(
      { availabilityDeadline },
      {
        onSuccess: () => {
          setShowExtendDeadlineModal(false);
          setExtendDeadlineError(null);
          setFeedbackMessage({ kind: 'success', text: '마감 일시가 연장되었습니다.' });
        },
        onError: (updateError) => {
          // 단축 거부 등 서버 메시지를 모달 내부 alert 로 노출
          const message =
            updateError instanceof ApiError
              ? updateError.message
              : '마감 연장 중 오류가 발생했습니다.';
          setExtendDeadlineError(message);
        },
      },
    );
  };

  const handleCancel = () => {
    cancelMutation.mutate(undefined, {
      onSuccess: () => {
        setShowCancelDialog(false);
        setFeedbackMessage({ kind: 'success', text: '라운드가 취소되었습니다.' });
      },
      onError: (cancelError) => {
        const message =
          cancelError instanceof ApiError
            ? cancelError.message
            : '라운드 취소 중 오류가 발생했습니다.';
        setFeedbackMessage({ kind: 'error', text: message });
      },
    });
  };

  const handleExcludeConfirm = () => {
    if (!excludeTarget) return;
    excludeMutation.mutate(excludeTarget.memberId, {
      onSuccess: () => {
        setExcludeTarget(null);
        setFeedbackMessage({
          kind: 'success',
          text: `${excludeTarget.userName}이(가) 제외되었습니다.`,
        });
      },
      onError: (excludeError) => {
        const message =
          excludeError instanceof ApiError
            ? excludeError.message
            : '제외 처리 중 오류가 발생했습니다.';
        setFeedbackMessage({ kind: 'error', text: message });
      },
    });
  };

  const handleAssignConfirm = (slotId: number) => {
    if (!assignTarget) return;
    assignMutation.mutate(
      { memberId: assignTarget.memberId, slotId },
      {
        onSuccess: () => {
          setAssignTarget(null);
          setFeedbackMessage({
            kind: 'success',
            text: `${assignTarget.userName}에게 슬롯이 배정되었습니다.`,
          });
        },
        onError: (assignError) => {
          const message =
            assignError instanceof ApiError
              ? assignError.message
              : '수동 배정 중 오류가 발생했습니다.';
          setFeedbackMessage({ kind: 'error', text: message });
        },
      },
    );
  };

  const handleSlotsCreated = (reinvitedCount: number) => {
    setFeedbackMessage({
      kind: 'success',
      text: `슬롯이 생성되었습니다. ${reinvitedCount}명에게 재초대가 발송되었습니다.`,
    });
  };

  // ── 렌더링 ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* 헤더 */}
      <div className="mb-6">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview`)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 면접 관리로 돌아가기
        </Link>
      </div>

      {/* 피드백 — success/error 구분 */}
      {feedbackMessage && (
        <div
          role={feedbackMessage.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'mb-4 rounded-md px-4 py-2 text-sm',
            feedbackMessage.kind === 'error'
              ? 'bg-rose-50 text-rose-700'
              : 'bg-emerald-50 text-emerald-700',
          )}
        >
          {feedbackMessage.text}
        </div>
      )}

      <div className="space-y-4">
        {/* 상태 배너 */}
        <RoundStatusBanner
          detail={detail}
          clubId={clubId}
          recruitmentId={recruitmentId}
          onAutoAssign={handleAutoAssign}
          onConfirm={handleConfirm}
          autoAssignPending={autoAssignMutation.isPending}
          confirmPending={confirmMutation.isPending}
        />

        {/* 카운트 카드 */}
        <RoundCountCards detail={detail} />

        {/* 가능없음 섹션 */}
        {counts.noAvailableSlotCount > 0 && (
          <NoSlotSection
            detail={detail}
            onExclude={setExcludeTarget}
            onManualAssign={setAssignTarget}
          />
        )}

        {/* 멤버 테이블 */}
        <RoundMemberTable
          detail={detail}
          onExclude={setExcludeTarget}
          onManualAssign={setAssignTarget}
        />

        {/* 슬롯 섹션 */}
        <RoundSlotsSection
          detail={detail}
          onSlotsCreated={handleSlotsCreated}
        />

        {/* 액션 바 — 비터미널 상태 */}
        {isNonTerminal && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4">
            {/* 재알림 — COLLECTING */}
            {status === 'COLLECTING' && (
              <button
                type="button"
                onClick={handleRemind}
                disabled={remindMutation.isPending}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {remindMutation.isPending ? '처리 중…' : '재알림'}
              </button>
            )}

            {/* 마감 연장 — COLLECTING */}
            {status === 'COLLECTING' && (
              <button
                type="button"
                onClick={() => {
                  setExtendDeadlineError(null);
                  setShowExtendDeadlineModal(true);
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                마감 연장
              </button>
            )}

            {/* 라운드 취소 */}
            <button
              type="button"
              onClick={() => setShowCancelDialog(true)}
              className="rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
            >
              라운드 취소
            </button>
          </div>
        )}
      </div>

      {/* 모달들 */}

      {showAutoAssignDialog && (
        <AutoAssignDialog
          status={status}
          pendingCount={detail.deadlinePassed ? counts.unrespondedCount : counts.invitedCount}
          onConfirm={handleAutoAssignConfirm}
          onCancel={() => setShowAutoAssignDialog(false)}
          isPending={autoAssignMutation.isPending}
        />
      )}

      {confirmDialogPayload && (
        <ConfirmRoundDialog
          unresolvedPayload={confirmDialogPayload}
          onForceConfirm={handleForceConfirm}
          onCancel={() => {
            setConfirmDialogPayload(null);
            setConfirmDialogError(null);
          }}
          isPending={confirmMutation.isPending}
          errorMessage={confirmDialogError}
        />
      )}

      {showCancelDialog && (
        <ConfirmDialog
          title="라운드 취소"
          description="라운드를 취소하면 멤버는 대기열로 복귀합니다. 계속하시겠습니까?"
          confirmLabel="확인"
          onConfirm={handleCancel}
          onCancel={() => setShowCancelDialog(false)}
          isPending={cancelMutation.isPending}
          destructive
        />
      )}

      {showExtendDeadlineModal && (
        <ExtendDeadlineModal
          currentDeadline={detail.availabilityDeadline}
          onSave={handleExtendDeadline}
          onCancel={() => {
            setShowExtendDeadlineModal(false);
            setExtendDeadlineError(null);
          }}
          isPending={updateMutation.isPending}
          errorMessage={extendDeadlineError}
        />
      )}

      {excludeTarget && (
        <ExcludeDialog
          memberName={excludeTarget.userName}
          onConfirm={handleExcludeConfirm}
          onCancel={() => setExcludeTarget(null)}
          isPending={excludeMutation.isPending}
        />
      )}

      {assignTarget && (
        <MemberAssignModal
          member={assignTarget}
          slots={detail.slots}
          onAssign={handleAssignConfirm}
          onCancel={() => setAssignTarget(null)}
          isPending={assignMutation.isPending}
          showRescheduleNotice={status === 'SCHEDULED'}
        />
      )}
    </div>
  );
}
