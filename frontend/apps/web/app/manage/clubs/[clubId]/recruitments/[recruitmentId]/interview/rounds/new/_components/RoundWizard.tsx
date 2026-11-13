'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@duing/api';
import {
  useInterviewRoundsQuery,
  useCancelInterviewRoundMutation,
} from '@duing/hooks';
import type { InterviewRoundCandidate } from '@duing/types';
import { WizardStepper } from './WizardStepper';
import { DraftResumeDialog } from './DraftResumeDialog';
import { Step1Candidates, isUndecidedCandidate } from './Step1Candidates';
import { Step2RoundForm } from './Step2RoundForm';
import { Step3Slots } from './Step3Slots';
import { Step4Review } from './Step4Review';
import { LoadingGate } from '@/components/loading/LoadingGate';

// wizard 컨테이너 (클라이언트 상태: step, selectedMap, roundId).
//
// 상태 설계 (스펙 §10.3):
//   step 1~4 — useState<1|2|3|4>
//   selectedMap — Map<applicationId, InterviewRoundCandidate> (RoundWizard 보유)
//     토글 off 시에도 이미 선택된 미결정 후보가 맵에서 유지됨
//   roundId — Step2 persist 성공 후 설정 (이어하기 경로도 동일)
//   roundsQuery — DRAFT 감지 (status==='DRAFT')
//
// DRAFT 감지 다이얼로그: roundId 가 아직 null 이고 draftRound 가 있으면 노출.
//   이어하기 → roundId 세팅 + Step2 진입
//   폐기 → cancel mutation → Step1 진입
//
// Step2 이후의 서버 상태는 react query 에서 fetch (단일 진실).

type WizardStep = 1 | 2 | 3 | 4;

type Props = {
  clubId: number;
  recruitmentId: number;
};

export function RoundWizard({ clubId, recruitmentId }: Props) {
  const [step, setStep] = useState<WizardStep>(1);
  /** applicationId → 선택된 후보 레코드 (토글과 무관하게 선택 시점 레코드 보존) */
  const [selectedMap, setSelectedMap] = useState<Map<number, InterviewRoundCandidate>>(new Map());
  const [roundId, setRoundId] = useState<number | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  // 폐기 오류는 그 라운드에 묶는다 — 거절 뒤 다시 받은 목록에 다른 초안이 있으면 그 창에 옛 초안의 문구를 남기지 않는다.
  const [discardError, setDiscardError] = useState<{ roundId: number; message: string } | null>(null);

  // 다른 탭·다른 운영진이 바꾼 30초 안 캐시로 창을 열지 않게 마운트 때마다 다시 받는다.
  const roundsQuery = useInterviewRoundsQuery(recruitmentId, { refetchOnMount: 'always' });
  const draftRound = roundsQuery.data?.find((round) => round.status === 'DRAFT') ?? null;

  const cancelMutation = useCancelInterviewRoundMutation(recruitmentId, draftRound?.roundId ?? 0);

  // DRAFT 다이얼로그 표시 조건: roundId 미설정 + draftRound 존재 + 사용자가 아직 선택 안 함
  const showDraftDialog = roundId === null && draftRound !== null && !draftDismissed;

  const handleResume = () => {
    if (!draftRound) return;
    setRoundId(draftRound.roundId);
    setDraftDismissed(true);
    setStep(2);
  };

  const handleDiscard = async () => {
    if (!draftRound) return;
    setDiscardError(null);
    try {
      // 화면이 본 단계(초안)를 싣는다 — 창이 열린 사이 발송·정리됐으면 서버가 409 로 막고 훅이 목록을 다시 받는다.
      await cancelMutation.mutateAsync('DRAFT');
      setDraftDismissed(true);
      setStep(1);
    } catch (discardFailure) {
      setDiscardError({
        roundId: draftRound.roundId,
        message:
          discardFailure instanceof ApiError && discardFailure.status === 409
            ? discardFailure.message
            : '라운드 폐기 중 오류가 발생했습니다. 다시 시도해주세요.',
      });
    }
  };

  // Step1 → Step2 진입
  const handleStep1Next = () => {
    setStep(2);
  };

  // Step2 라운드 생성 성공 콜백
  const handleRoundCreated = (newRoundId: number) => {
    setRoundId(newRoundId);
  };

  // Step2 → Step3
  const handleStep2Next = () => {
    setStep(3);
  };

  // Step3 → Step4
  const handleStep3Next = () => {
    setStep(4);
  };

  // 미결정(SUBMITTED·ON_HOLD) 선택 수 — 맵에서 직접 계산 (토글과 무관)
  const undecidedSelectedCount = Array.from(selectedMap.values()).filter(
    isUndecidedCandidate,
  ).length;

  // selectedApplicationIds — Step2 에 전달할 id 배열
  const selectedApplicationIds = Array.from(selectedMap.keys());

  // 폐기가 거절된 뒤 다시 받은 목록에 초안이 없으면 창이 내려간다 — 설명 없이 1단계에 놓이지 않게 창 밖에 알린다.
  const draftGoneAfterFailedDiscard =
    discardError !== null && roundId === null && !draftDismissed && draftRound === null && step === 1;
  const draftGoneNoticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!draftGoneAfterFailedDiscard) return;
    // 창이 내려가며 포커스가 body 로 빠진다 — 이 알림으로 옮긴다. setTimeout 0 은 창의 닫힘 처리(Radix·공용 복귀) 뒤에 돌게 하는 방어다.
    const focusTimer = setTimeout(() => draftGoneNoticeRef.current?.focus(), 0);
    return () => clearTimeout(focusTimer);
  }, [draftGoneAfterFailedDiscard]);

  // 마운트 뒤 첫 응답 전에는 낡은 캐시로 창을 열지 않는다 — 첫 응답 뒤의 무효화로는 단계를 내리지 않는다.
  const isAwaitingFirstRoundsResponse = roundsQuery.isFetching && !roundsQuery.isFetchedAfterMount;
  if (isAwaitingFirstRoundsResponse) {
    return <LoadingGate label="면접 라운드 불러오는 중" />;
  }

  // 고르기 전 목록 실패는 막는다 — 낡은 캐시로 창을 열면 그사이 발송된 라운드를 폐기(취소)할 수 있다.
  if (roundsQuery.isError && roundId === null && !draftDismissed) {
    const message =
      roundsQuery.error instanceof ApiError
        ? roundsQuery.error.message
        : '면접 라운드 목록을 불러오지 못했습니다.';
    return <p className="p-6 text-sm text-coral-deep">{message}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink-deep">새 면접 라운드 만들기</h1>
      </div>

      <div className="mb-6">
        <WizardStepper currentStep={step} />
      </div>

      {showDraftDialog && draftRound && (
        <DraftResumeDialog
          draftRound={draftRound}
          clubId={clubId}
          recruitmentId={recruitmentId}
          isPending={cancelMutation.isPending}
          // 거절 뒤 목록을 다시 받는 동안도 막는다 — 그사이 [이어하기]를 누르면 발송된 라운드로 2단계에 들어간다.
          isRefreshing={discardError !== null && roundsQuery.isFetching}
          onResume={handleResume}
          onDiscard={handleDiscard}
          discardError={discardError?.roundId === draftRound.roundId ? discardError.message : null}
          isDraftReplaced={discardError !== null && discardError.roundId !== draftRound.roundId}
        />
      )}

      {draftGoneAfterFailedDiscard && (
        // 창이 사라진 뒤 포커스를 받는 자리(탭 순서 밖) — 포커스 표시는 라운드 현황 배너와 같은 안쪽 outline.
        <p
          ref={draftGoneNoticeRef}
          role="alert"
          tabIndex={-1}
          className="mb-4 break-keep rounded-md border border-coral/20 bg-coral/5 px-3 py-2 text-sm text-coral-deep focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
        >
          작성 중이던 라운드가 그사이 발송되었거나 정리되었습니다. 면접 관리에서 지금 상태를 확인해주세요.
        </p>
      )}

      <div className="rounded-lg border border-line bg-white p-6">
        {step === 1 && (
          <Step1Candidates
            recruitmentId={recruitmentId}
            selectedMap={selectedMap}
            onSelectionMapChange={setSelectedMap}
            onNext={handleStep1Next}
          />
        )}

        {step === 2 && (
          <Step2RoundForm
            recruitmentId={recruitmentId}
            roundId={roundId}
            selectedApplicationIds={selectedApplicationIds}
            undecidedSelectedCount={undecidedSelectedCount}
            onRoundCreated={handleRoundCreated}
            onNext={handleStep2Next}
          />
        )}

        {step === 3 && roundId !== null && (
          <Step3Slots roundId={roundId} onNext={handleStep3Next} />
        )}

        {step === 4 && roundId !== null && (
          <Step4Review
            recruitmentId={recruitmentId}
            roundId={roundId}
            clubId={clubId}
          />
        )}
      </div>
    </div>
  );
}
