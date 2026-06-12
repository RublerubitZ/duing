// 면접 라운드(재설계) 훅 — 신규 interviewRounds 클라이언트 그룹.
// 구 interview.ts 와 분리된 신규 파일이며 구 훅은 미접촉.
import type {
  CreateInterviewRoundPayload,
  CreateRoundSlotsPayload,
  UpdateInterviewRoundPayload,
} from '@duing/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './api-context';
import { interviewRoundKeys } from './interviewRoundQueryKeys';

// =====================================================================
// Queries
// =====================================================================

/**
 * 면접 라운드 후보 목록 조회 (BE#2)
 * includeUnderReview 가 쿼리키에 포함되어 토글 시 별도 캐시 엔트리로 관리된다.
 */
export function useInterviewRoundCandidatesQuery(
  recruitmentId: number,
  includeUnderReview: boolean,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: [...interviewRoundKeys.candidates(recruitmentId), includeUnderReview] as const,
    queryFn: () => client.interviewRounds.candidates(recruitmentId, includeUnderReview),
  });
}

/** 면접 라운드 목록 조회 (BE#6) */
export function useInterviewRoundsQuery(recruitmentId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewRoundKeys.list(recruitmentId),
    queryFn: () => client.interviewRounds.list(recruitmentId),
  });
}

/**
 * 면접 라운드 상세 조회 (BE#6)
 * enabled 옵션: roundId 가 확정된 step 2 이후에만 fetch 하도록 wizard 에서 제어.
 */
export function useInterviewRoundDetailQuery(
  roundId: number,
  options: { enabled?: boolean } = {},
) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewRoundKeys.detail(roundId),
    queryFn: () => client.interviewRounds.detail(roundId),
    enabled: options.enabled ?? true,
  });
}

// =====================================================================
// Mutations — invalidation 매트릭스 (스펙 §10.1)
// =====================================================================

/**
 * 면접 라운드 생성 (BE#3)
 * 성공 → list(recruitmentId) + candidates(recruitmentId) invalidate
 * (생성 시 멤버 대기열 변동 + 목록 갱신)
 */
export function useCreateInterviewRoundMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateInterviewRoundPayload) =>
      client.interviewRounds.create(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.list(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.candidates(recruitmentId),
      });
    },
  });
}

/**
 * 면접 라운드 수정 (BE#12 — PATCH)
 * 성공 → detail(roundId) + list(recruitmentId) invalidate
 */
export function useUpdateInterviewRoundMutation(recruitmentId: number, roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateInterviewRoundPayload) =>
      client.interviewRounds.update(roundId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.list(recruitmentId),
      });
    },
  });
}

/**
 * 면접 라운드 취소
 * 성공 → list(recruitmentId) + candidates(recruitmentId) invalidate
 * (취소 시 멤버 대기열 복귀 — 재큐잉이므로 candidates 포함 §10.1)
 */
export function useCancelInterviewRoundMutation(recruitmentId: number, roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.interviewRounds.cancel(roundId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.list(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.candidates(recruitmentId),
      });
    },
  });
}

/**
 * 슬롯 일괄 생성 (BE#4)
 * 성공 → detail(roundId) invalidate
 * (슬롯 목록 + 멤버 reinvitedMemberCount 반영)
 */
export function useCreateRoundSlotsMutation(roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRoundSlotsPayload) =>
      client.interviewRounds.createSlots(roundId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
    },
  });
}

/**
 * 슬롯 삭제
 * 성공 → detail(roundId) invalidate
 */
export function useDeleteRoundSlotMutation(roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slotId: number) => client.interviewRounds.deleteSlot(slotId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
    },
  });
}

/**
 * 가능시간 요청 발송 (BE#5) — DRAFT → COLLECTING 전환
 * 성공 → detail(roundId) + list(recruitmentId) invalidate
 * (상태 전이 + 알림 발송 인원수 반영)
 */
export function useRequestAvailabilityMutation(recruitmentId: number, roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.interviewRounds.requestAvailability(roundId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.list(recruitmentId),
      });
    },
  });
}
