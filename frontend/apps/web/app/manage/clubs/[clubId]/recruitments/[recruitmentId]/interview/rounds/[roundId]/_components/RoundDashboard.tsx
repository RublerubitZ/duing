'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
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
  interviewRoundKeys,
} from '@duing/hooks';
import { isUnresolvedMembersPayload } from '@duing/types';
import type { InterviewRoundDetailMember, UnresolvedMembersPayload } from '@duing/types';
import { toRoute } from '@/app/_lib/route';
import { cn } from '@/app/_lib/cn';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { AutoAssignDialog } from './AutoAssignDialog';
import { ConfirmRoundDialog } from './ConfirmRoundDialog';
import { MemberAssignModal } from './MemberAssignModal';
import { ExtendDeadlineModal } from './ExtendDeadlineModal';
import { RoundStatusBanner, ROUND_STATUS_BANNER_ID } from './RoundStatusBanner';
import { RoundCountCards } from './RoundCountCards';
import { RoundMemberTable, roundMemberRowId } from './RoundMemberTable';
import { NoSlotSection } from './NoSlotSection';
import { RoundSlotsSection } from './RoundSlotsSection';
import { ArrowLeft } from '@/components/duing/Icon';

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
  errorMessage: string | null;
};

function ExcludeDialog({
  memberName,
  onConfirm,
  onCancel,
  isPending,
  errorMessage,
}: ExcludeDialogProps) {
  return (
    <ConfirmDialog
      open
      title={`${memberName} 제외`}
      description="제외된 지원자는 대기열로 복귀합니다. 계속하시겠습니까?"
      confirmLabel="제외하기"
      onConfirm={onConfirm}
      onCancel={onCancel}
      isPending={isPending}
      busyLabel="제외 처리 중"
      errorMessage={errorMessage}
    />
  );
}

// 포커스가 body 로 빠졌을 때만 그 요소(멤버 행·상태 배너)로 보낸다 — 공용 복귀가 돌려놓은 버튼이나 사용자가 옮긴 자리는 건드리지 않는다.
// 멤버 행은 화면이 튀지 않게 그 자리에서 받고, 상태 배너는 [확정]을 누른 뒤 스크롤했거나 [라운드 취소](페이지 아래 동작 막대)를 눌러 화면 밖이면 보이게 한다.
function focusElementIfFocusLost(elementId: string) {
  const activeElement = document.activeElement;
  if (activeElement !== null && activeElement !== document.body) return;
  document.getElementById(elementId)?.focus({ preventScroll: elementId !== ROUND_STATUS_BANNER_ID });
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
  // 라운드 취소·멤버 제외 확인 모달의 실패 — 전역 피드백에 넣으면 모달 스크림·aria-hidden 뒤에 갇힌다.
  const [confirmActionError, setConfirmActionError] = useState<string | null>(null);
  // 수동 배정 창의 실패 — 창을 열어 둔 채 안에서 안내한다(409 면 다시 받은 슬롯·단계로 창이 다시 그려진다).
  const [assignDialogError, setAssignDialogError] = useState<string | null>(null);

  // 인라인 피드백
  const [feedbackMessage, setFeedbackMessage] = useState<FeedbackMessage | null>(null);

  // 피드백 4초 자동 소멸 — 로딩/에러 early return 이전에 선언해 훅 순서 고정
  useEffect(() => {
    if (feedbackMessage === null) return;
    const dismissTimer = setTimeout(() => setFeedbackMessage(null), 4_000);
    return () => clearTimeout(dismissTimer);
  }, [feedbackMessage]);

  // 멤버 동작 창이 닫힌 뒤 포커스가 body 면(돌아갈 버튼이 사라졌거나, 클릭이 버튼에 포커스를 주지 않는 Safari 처럼 기억한 자리가 없을 때) 그 멤버 행으로,
  // 확정·라운드 취소가 성공해 누른 버튼([확정]·동작 막대)이 사라지면 상태 배너로 — 표지(포커스를 보낼 요소 id)는 멤버 창이 닫힐 때·확정이나 라운드 취소가 성공할 때 세우고,
  // 기다릴 다시 받기가 없거나 세운 뒤 첫 상세 갱신(실패 포함)이 오거나 이 화면이 여는 다른 창이 열리면 지운다.
  const queryClient = useQueryClient();
  const focusGuardTargetIdRef = useRef<string | null>(null);
  const memberDialogMemberId = excludeTarget?.memberId ?? assignTarget?.memberId ?? null;
  const isAnyDialogOpen =
    memberDialogMemberId !== null ||
    showAutoAssignDialog ||
    showCancelDialog ||
    showExtendDeadlineModal ||
    confirmDialogPayload !== null;

  useEffect(() => {
    if (isAnyDialogOpen) focusGuardTargetIdRef.current = null;
  }, [isAnyDialogOpen]);

  useEffect(() => {
    if (memberDialogMemberId === null) return;
    return () => {
      const memberRowId = roundMemberRowId(memberDialogMemberId);
      focusGuardTargetIdRef.current = memberRowId;
      // 창 언마운트 때 Radix FocusScope 가 건 복귀(setTimeout 0)가 먼저 돌게 한다 — 이 정리는 창의 언마운트 정리 뒤에 실행된다.
      setTimeout(() => {
        focusElementIfFocusLost(memberRowId);
        // 다시 받는 중이 아니면 기다릴 상세 갱신도 없다 — 표지를 남기면 나중의 관계없는 갱신(자동배정 등)이 이 행으로 끌어온다.
        if (queryClient.isFetching({ queryKey: interviewRoundKeys.detail(roundId) }) === 0) focusGuardTargetIdRef.current = null;
      }, 0);
    };
  }, [memberDialogMemberId, queryClient, roundId]);

  useEffect(() => {
    const guardedElementId = focusGuardTargetIdRef.current;
    if (guardedElementId === null) return;
    focusGuardTargetIdRef.current = null;
    // 바로 옮기지 않는다 — 다시 받기가 창의 닫힘 복귀(setTimeout 0)보다 먼저 그려지면 남아 있는 버튼 대신 행으로 간다.
    setTimeout(() => focusElementIfFocusLost(guardedElementId), 0);
  }, [detailQuery.dataUpdatedAt, detailQuery.errorUpdatedAt]);

  // Mutations
  const autoAssignMutation = useRoundAutoAssignMutation(recruitmentId, roundId);
  const confirmMutation = useConfirmRoundMutation(recruitmentId, roundId);
  const remindMutation = useRemindMutation(roundId);
  const updateMutation = useUpdateInterviewRoundMutation(recruitmentId, roundId);
  const cancelMutation = useCancelInterviewRoundMutation(recruitmentId, roundId);
  const excludeMutation = useExcludeMemberMutation(recruitmentId, roundId);
  const assignMutation = useAssignMemberScheduleMutation(roundId);

  if (detailQuery.isLoading) {
    return <LoadingGate label="라운드 정보 불러오는 중" />;
  }

  if (detailQuery.isError || !detailQuery.data) {
    const message =
      detailQuery.error instanceof ApiError
        ? detailQuery.error.message
        : '라운드 정보를 불러오지 못했습니다.';
    return <p className="p-6 text-sm text-coral-deep">{message}</p>;
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
      onSuccess: (autoAssignResult) => {
        setShowAutoAssignDialog(false);
        // unassignedMemberCount = 매칭 입력(RESPONDED) 중 고른 슬롯이 모두 차 못 받은 사람 수
        setFeedbackMessage({
          kind: 'success',
          text:
            autoAssignResult.unassignedMemberCount > 0
              ? `자동배정이 완료되었습니다 — 응답자 ${autoAssignResult.unassignedMemberCount}명은 고른 시간이 모두 차 배정받지 못했습니다.`
              : '자동배정이 완료되었습니다.',
        });
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
        // 확정 단계로 다시 받으면 [확정]이 사라져 포커스가 body 로 빠진다 — 그 갱신 한 번에 상태 배너로 보낸다.
        // (훅은 무효화를 기다리지 않아 다시 받은 상세보다 이 콜백이 먼저 돈다)
        focusGuardTargetIdRef.current = ROUND_STATUS_BANNER_ID;
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
        // 창이 닫히고 확정 상세를 다시 받으면 [확정]이 사라진다 — 위 handleConfirm 과 같다.
        focusGuardTargetIdRef.current = ROUND_STATUS_BANNER_ID;
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
    setConfirmActionError(null);
    cancelMutation.mutate(undefined, {
      onSuccess: () => {
        // 취소된 상세를 다시 받으면 동작 막대가 사라져 포커스가 body 로 빠진다 — 확정과 같이 그 갱신 한 번에 상태 배너로 보낸다.
        focusGuardTargetIdRef.current = ROUND_STATUS_BANNER_ID;
        setShowCancelDialog(false);
        setFeedbackMessage({ kind: 'success', text: '라운드가 취소되었습니다.' });
      },
      onError: (cancelError) => {
        const message =
          cancelError instanceof ApiError
            ? cancelError.message
            : '라운드 취소 중 오류가 발생했습니다.';
        // 실패해도 모달을 닫지 않고 모달 안에서 안내한다(공통 규칙).
        setConfirmActionError(message);
      },
    });
  };

  const handleExcludeConfirm = () => {
    if (!excludeTarget) return;
    setConfirmActionError(null);
    excludeMutation.mutate(excludeTarget.memberId, {
      onSuccess: () => {
        setExcludeTarget(null);
        setFeedbackMessage({
          kind: 'success',
          // '님'은 늘 '이'를 받는다 — 받침 판별 없이 영문 이름에도 맞다(콘솔의 `OOO 님을 …` 관례).
          text: `${excludeTarget.userName} 님이 제외되었습니다.`,
        });
      },
      onError: (excludeError) => {
        const message =
          excludeError instanceof ApiError
            ? excludeError.message
            : '제외 처리 중 오류가 발생했습니다.';
        setConfirmActionError(message);
      },
    });
  };

  const handleAssignConfirm = (slotId: number) => {
    if (!assignTarget) return;
    setAssignDialogError(null);
    assignMutation.mutate(
      { memberId: assignTarget.memberId, slotId, expectedRoundStatus: status },
      {
        onSuccess: () => {
          setAssignTarget(null);
          setFeedbackMessage({
            kind: 'success',
            // 실어 보낸 단계(status)를 서버가 검증한다 — 확정 단계의 성공은 지원자에게 일정 변경 알림이 가는 재배정이다.
            text:
              status === 'SCHEDULED'
                ? `${assignTarget.userName} 님의 면접 일정이 변경되었습니다. 지원자에게 일정 변경 알림이 발송됩니다.`
                : `${assignTarget.userName} 님에게 슬롯이 배정되었습니다.`,
          });
        },
        onError: (assignError) => {
          const message =
            assignError instanceof ApiError
              ? assignError.message
              : '수동 배정 중 오류가 발생했습니다.';
          setAssignDialogError(message);
        },
      },
    );
  };

  const openAssignDialog = (member: InterviewRoundDetailMember) => {
    setAssignTarget(member);
    // 확정 단계는 바꾸면 지원자에게 알림이 간다 — 창을 닫은 사이 다른 탭이 옮긴 일정이 '지금 일정'으로 보이게 열 때 다시 받는다(창은 다시 받은 상세의 멤버를 쓴다).
    if (status === 'SCHEDULED') void detailQuery.refetch();
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
          className="inline-flex items-center gap-1 text-sm text-charcoal-3 hover:text-charcoal"
        >
          <ArrowLeft size={14} aria-hidden />
          면접 관리로 돌아가기
        </Link>
      </div>

      {/* 피드백 — success/error 구분 */}
      {feedbackMessage && (
        <div
          role={feedbackMessage.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'mb-4 rounded-md px-4 py-2 text-sm',
            feedbackMessage.kind === 'error'
              ? 'bg-coral/10 text-coral-deep'
              : 'bg-sage-mist text-ink',
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
            onManualAssign={openAssignDialog}
          />
        )}

        {/* 멤버 테이블 */}
        <RoundMemberTable
          detail={detail}
          onExclude={setExcludeTarget}
          onManualAssign={openAssignDialog}
        />

        {/* 슬롯 섹션 */}
        <RoundSlotsSection
          detail={detail}
          onSlotsCreated={handleSlotsCreated}
        />

        {/* 액션 바 — 비터미널 상태 */}
        {isNonTerminal && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-white px-5 py-4">
            {/* 재알림 — COLLECTING */}
            {status === 'COLLECTING' && (
              <button
                type="button"
                onClick={handleRemind}
                disabled={remindMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-charcoal hover:bg-cream disabled:opacity-50"
              >
                {remindMutation.isPending && <ButtonSpinner />}재알림
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
                className="rounded-md border border-line px-3 py-1.5 text-sm text-charcoal hover:bg-cream"
              >
                마감 연장
              </button>
            )}

            {/* 라운드 취소 */}
            <button
              type="button"
              onClick={() => setShowCancelDialog(true)}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-danger hover:bg-danger/5"
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
          // 409 뒤 상세를 다시 받는 동안엔 낡은 정원·배정으로 빈 자리를 판정하지 않는다(null = 보류) — 다 받은 뒤 표시
          slots={detailQuery.isFetching ? null : detail.slots}
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
          open
          title="라운드 취소"
          description="라운드를 취소하면 지원자는 대기열로 복귀합니다. 계속하시겠습니까?"
          confirmLabel="라운드 취소하기"
          onConfirm={handleCancel}
          onCancel={() => {
            setShowCancelDialog(false);
            setConfirmActionError(null);
          }}
          isPending={cancelMutation.isPending}
          busyLabel="라운드 취소 중"
          errorMessage={confirmActionError}
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
          onCancel={() => {
            setExcludeTarget(null);
            setConfirmActionError(null);
          }}
          isPending={excludeMutation.isPending}
          errorMessage={confirmActionError}
        />
      )}

      {assignTarget && (
        <MemberAssignModal
          // 연 때의 사본이 아니라 지금 상세의 그 멤버 — 409 뒤 다시 받은 상세에서 지금 일정이 바뀌었을 수 있다.
          // 지금 일정 판정과 함께, 아직 고르지 않은 동안의 선택 출처이기도 하다.
          member={detail.members.find((detailMember) => detailMember.memberId === assignTarget.memberId) ?? assignTarget}
          slots={detail.slots}
          roundStatus={status}
          onAssign={handleAssignConfirm}
          onCancel={() => {
            setAssignTarget(null);
            setAssignDialogError(null);
          }}
          isPending={assignMutation.isPending}
          errorMessage={assignDialogError}
        />
      )}
    </div>
  );
}
