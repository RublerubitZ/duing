'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import {
  useCreateInterviewRoundMutation,
  useUpdateInterviewRoundMutation,
  useInterviewRoundDetailQuery,
} from '@duing/hooks';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';

// Step2: 라운드 정보 입력 및 첫 저장(생성 모드) 또는 수정(이어하기 모드).
//
// 생성 모드 (roundId === null):
//   - title(필수), availabilityDeadline(필수), location(선택) 입력
//   - underReviewSelectedCount > 0 이면 전환 경고 표시 (§10.3)
//   - useCreateInterviewRoundMutation → setRoundId → Step3
//
// 이어하기 모드 (roundId !== null):
//   - detailQuery 프리필 (멤버 변경 불가 — BE 계약에 멤버 추가 API 없음)
//   - 변경분만 useUpdateInterviewRoundMutation (무변경이면 호출 생략) → Step3

type Props = {
  recruitmentId: number;
  roundId: number | null;
  selectedApplicationIds: number[];
  /** Step1 에서 선택된 UNDER_REVIEW 상태 후보 수 (생성 모드에서 전환 경고 표시용) */
  underReviewSelectedCount: number;
  onRoundCreated: (roundId: number) => void;
  onNext: () => void;
};

export function Step2RoundForm({
  recruitmentId,
  roundId,
  selectedApplicationIds,
  underReviewSelectedCount,
  onRoundCreated,
  onNext,
}: Props) {
  const isResumeMode = roundId !== null;

  const detailQuery = useInterviewRoundDetailQuery(roundId ?? 0, {
    enabled: isResumeMode,
  });
  const detail = detailQuery.data;

  const [title, setTitle] = useState('');
  const [availabilityDeadline, setAvailabilityDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  // 이어하기 모드: detailQuery 로드 완료 후 1회 프리필
  const [prefilledRoundId, setPrefilledRoundId] = useState<number | null>(null);
  if (isResumeMode && detail && detail.roundId !== prefilledRoundId) {
    setTitle(detail.title);
    setAvailabilityDeadline(detail.availabilityDeadline?.slice(0, 16) ?? '');
    setLocation(detail.location ?? '');
    setPrefilledRoundId(detail.roundId);
  }

  const createMutation = useCreateInterviewRoundMutation(recruitmentId);
  const updateMutation = useUpdateInterviewRoundMutation(recruitmentId, roundId ?? 0);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApiError(null);

    try {
      if (isResumeMode && roundId !== null) {
        // 이어하기 모드 — 변경분만 PATCH
        const originalTitle = detail?.title ?? '';
        const originalDeadline = detail?.availabilityDeadline?.slice(0, 16) ?? '';
        const originalLocation = detail?.location ?? '';

        const hasChanges =
          title !== originalTitle ||
          availabilityDeadline !== originalDeadline ||
          location !== originalLocation;

        if (hasChanges) {
          await updateMutation.mutateAsync({
            title: title || undefined,
            availabilityDeadline: availabilityDeadline || undefined,
            location: location || undefined,
          });
        }
        onNext();
      } else {
        // 생성 모드 — 첫 persist
        const result = await createMutation.mutateAsync({
          title,
          availabilityDeadline: availabilityDeadline || undefined,
          location: location || undefined,
          applicationIds: selectedApplicationIds,
        });
        onRoundCreated(result.roundId);
        onNext();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setApiError(error.message);
      } else {
        setApiError('라운드 저장 중 오류가 발생했습니다.');
      }
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isResumeMode && detailQuery.isLoading) {
    return <LoadingGate label="라운드 정보 불러오는 중" className="min-h-0 py-8" />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-slate-900">라운드 정보</h2>

      {isResumeMode && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
          이어하기 모드입니다. 라운드 정보를 수정하고 다음으로 진행하세요.
        </div>
      )}

      {!isResumeMode && underReviewSelectedCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          서류 검토 중 지원자 {underReviewSelectedCount}명은 생성 즉시 면접 대상(INTERVIEW_PENDING)으로
          전환됩니다.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="block text-xs font-medium text-slate-600">
            라운드 제목 <span className="text-rose-500">*</span>
          </span>
          <input
            type="text"
            id="round-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="예: 1차 면접"
            aria-label="라운드 제목"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs font-medium text-slate-600">
            가능시간 제출 마감 <span className="text-rose-500">*</span>
          </span>
          <input
            type="datetime-local"
            id="availability-deadline"
            value={availabilityDeadline}
            onChange={(event) => setAvailabilityDeadline(event.target.value)}
            required
            aria-label="가능시간 제출 마감"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs font-medium text-slate-600">장소 (선택)</span>
          <input
            type="text"
            id="round-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="예: 공학관 2201호"
            aria-label="장소"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        {apiError && (
          <div
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {apiError}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <div />
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending && <ButtonSpinner />}
            {isResumeMode ? '저장하고 다음' : '라운드 생성'}
          </button>
        </div>
      </form>
    </div>
  );
}
