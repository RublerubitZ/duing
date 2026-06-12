'use client';

import { useState } from 'react';
import {
  useInterviewRoundsQuery,
  useCancelInterviewRoundMutation,
} from '@duing/hooks';
import type { InterviewRoundCandidate } from '@duing/types';
import { WizardStepper } from './WizardStepper';
import { DraftResumeDialog } from './DraftResumeDialog';
import { Step1Candidates } from './Step1Candidates';
import { Step2RoundForm } from './Step2RoundForm';
import { Step3Slots } from './Step3Slots';
import { Step4Review } from './Step4Review';

// wizard 컨테이너 (클라이언트 상태: step, selectedMap, roundId).
//
// 상태 설계 (스펙 §10.3):
//   step 1~4 — useState<1|2|3|4>
//   selectedMap — Map<applicationId, InterviewRoundCandidate> (RoundWizard 보유)
//     토글 off 시에도 이미 선택된 UNDER_REVIEW 후보가 맵에서 유지됨
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
  const [discardError, setDiscardError] = useState<string | null>(null);

  const roundsQuery = useInterviewRoundsQuery(recruitmentId);
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
      await cancelMutation.mutateAsync();
      setDraftDismissed(true);
      setStep(1);
    } catch {
      setDiscardError('라운드 폐기 중 오류가 발생했습니다. 다시 시도해주세요.');
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

  // UNDER_REVIEW 선택 수 — 맵에서 직접 계산 (토글과 무관)
  const underReviewSelectedCount = Array.from(selectedMap.values()).filter(
    (candidate) => candidate.status === 'UNDER_REVIEW',
  ).length;

  // selectedApplicationIds — Step2 에 전달할 id 배열
  const selectedApplicationIds = Array.from(selectedMap.keys());

  // DRAFT 체크 중 로딩 — 목록 조회 전에 다이얼로그가 깜박이지 않도록
  if (roundsQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">새 면접 라운드 만들기</h1>
      </div>

      <div className="mb-6">
        <WizardStepper currentStep={step} />
      </div>

      {showDraftDialog && draftRound && (
        <DraftResumeDialog
          draftRound={draftRound}
          isPending={cancelMutation.isPending}
          onResume={handleResume}
          onDiscard={handleDiscard}
          discardError={discardError}
        />
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6">
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
            underReviewSelectedCount={underReviewSelectedCount}
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
