// 면접 라운드(재설계) 훅 — 신규 interviewRounds 클라이언트 그룹.
// 구 interview.ts 와 분리된 신규 파일이며 구 훅은 미접촉.
import type {
  CreateInterviewRoundPayload,
  CreateRoundSlotsPayload,
  InterviewRoundStatus,
  UpdateInterviewRoundPayload,
  UpdateInterviewSlotPayload,
} from '@duing/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import { useApiClient } from './api-context';
import { applicationQueryKeys } from './applicationQueryKeys';
import { interviewRoundKeys } from './interviewRoundQueryKeys';
import { statsQueryKeys } from './statsQueryKeys';

// =====================================================================
// Queries
// =====================================================================

/**
 * 면접 라운드 후보 목록 조회 (BE#2)
 * includeUndecided 가 쿼리키에 포함되어 토글 시 별도 캐시 엔트리로 관리된다.
 */
export function useInterviewRoundCandidatesQuery(
  recruitmentId: number,
  includeUndecided: boolean,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewRoundKeys.candidates(recruitmentId, includeUndecided),
    queryFn: () => client.interviewRounds.candidates(recruitmentId, includeUndecided),
  });
}

/**
 * 면접 라운드 목록 조회 (BE#6)
 * refetchOnMount 옵션: 라운드 마법사가 신선한 캐시여도 마운트 때 다시 받도록 'always' 를 넘긴다.
 */
export function useInterviewRoundsQuery(
  recruitmentId: number,
  options: { refetchOnMount?: boolean | 'always' } = {},
) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewRoundKeys.list(recruitmentId),
    queryFn: () => client.interviewRounds.list(recruitmentId),
    refetchOnMount: options.refetchOnMount ?? true,
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
 * 성공 → list(recruitmentId) + candidates(recruitmentId) invalidate (생성 시 멤버 대기열 변동 + 목록 갱신)
 * + 통계·지원자 목록·이웃 순서·고른 지원서 상세 — 생성이 고른 지원을 SUBMITTED·ON_HOLD → INTERVIEW_PENDING 으로 바꾼다
 */
export function useCreateInterviewRoundMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateInterviewRoundPayload) =>
      client.interviewRounds.create(recruitmentId, payload),
    onSuccess: (_createdRound, variables) => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.list(recruitmentId),
      });
      // 라운드를 만드는 순간(마법사 2단계)엔 대기열을 보는 화면이 없다 — 바로 다시 받아 홈이 낡은 대기열로 '생성 필요'를 겹쳐 내지 않게.
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.candidates(recruitmentId),
        refetchType: 'all',
      });
      queryClient.invalidateQueries({
        queryKey: statsQueryKeys.byRecruitment(recruitmentId),
      });
      // 홈이 읽는 통계 요약도 같은 이유로 바로 다시 받는다(면접 대상이 된 사람을 '검토 대기'로도 겹쳐 내지 않게) — 떠 있는 요약은 위 무효화가 이미 받으므로 inactive 만.
      queryClient.refetchQueries({ queryKey: statsQueryKeys.summary(recruitmentId), type: 'inactive' });
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicants(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantNeighborsAll(),
      });
      // 일괄 변경과 같은 이유 — 상세를 다시 열면 낡은 캐시로 옛 상태의 전이 버튼이 계산돼 400 PATCH 가 난다.
      for (const applicationId of variables.applicationIds) {
        queryClient.invalidateQueries({
          queryKey: applicationQueryKeys.applicantDetail(applicationId),
        });
      }
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
 * 면접 라운드 취소 — 변수 = 화면이 본 라운드 단계(선택, 마법사의 폐기는 'DRAFT'. 없으면 싣지 않는다)
 * 성공 → detail(roundId) + list(recruitmentId) + candidates(recruitmentId) invalidate
 * (취소 시 상태 전이가 detail 에 반영 + 멤버 대기열 복귀 — 재큐잉이므로 candidates 포함 §10.1)
 * 409 → list(recruitmentId) + candidates(recruitmentId) invalidate (화면의 목록이 낡았다 — 그사이 발송·정리된 초안 등)
 */
export function useCancelInterviewRoundMutation(recruitmentId: number, roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedRoundStatus?: InterviewRoundStatus) =>
      client.interviewRounds.cancel(roundId, expectedRoundStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.list(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.candidates(recruitmentId),
      });
      // 진행 중 라운드가 줄면 모집의 자동 마감 전망(통계 요약)이 바뀐다(#1572).
      queryClient.invalidateQueries({ queryKey: statsQueryKeys.byRecruitment(recruitmentId) });
    },
    onError: (cancelError) => {
      // 409 = 화면이 본 단계와 다르다 — 다른 운영진이 정리했으면 멤버가 대기열로 돌아와 후보도 바뀐다. return 하면 재조회가 끝날 때까지 호출부 안내가 밀린다.
      if (cancelError instanceof ApiError && cancelError.status === 409) {
        void queryClient.invalidateQueries({ queryKey: interviewRoundKeys.list(recruitmentId) });
        void queryClient.invalidateQueries({ queryKey: interviewRoundKeys.candidates(recruitmentId) });
      }
    },
  });
}

/**
 * 슬롯 일괄 생성 (BE#4)
 * 성공 → detail(roundId) invalidate + 재초대가 있으면(reinvitedMemberCount > 0) 모든 모집의 list
 * (슬롯 목록 + 멤버 reinvitedMemberCount 반영)
 */
export function useCreateRoundSlotsMutation(roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRoundSlotsPayload) =>
      client.interviewRounds.createSlots(roundId, payload),
    onSuccess: (slotsResult) => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
      // 목록의 응답 수는 재초대로만 바뀐다(늘 걸면 목록을 보는 마법사 3단계가 헛되이 다시 받는다) — 모집 id 를 몰라 접두로 건다.
      if (slotsResult.reinvitedMemberCount > 0) {
        queryClient.invalidateQueries({ queryKey: interviewRoundKeys.listAll() });
      }
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

/**
 * 자동배정 실행 (BE#11) — COLLECTING → ASSIGNING 전환 또는 ASSIGNING 재계산
 * 성공 → detail(roundId) + list(recruitmentId) invalidate
 * (상태 전이 + 배정 현황 반영)
 */
export function useRoundAutoAssignMutation(recruitmentId: number, roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.interviewRounds.autoAssign(roundId),
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
 * 수동 배정/재배정 (BE#11 — 배정 검토 단계 한정)
 * 성공 → detail(roundId) invalidate
 * 409 → detail(roundId) invalidate (화면의 상세가 낡았을 수 있다 — 다른 운영진이 결과를 정해 제외된 멤버 등)
 * 400 → detail(roundId) invalidate (고른 슬롯이 그사이 지워졌다 — InvalidSlotSelection, 화면이 보내는 값으로 받을 수 있는 400 은 이것뿐)
 */
export function useAssignMemberScheduleMutation(roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      slotId,
      expectedRoundStatus,
    }: {
      memberId: number;
      slotId: number;
      expectedRoundStatus: InterviewRoundStatus;
    }) => client.interviewRounds.assignMemberSchedule(roundId, memberId, { slotId, expectedRoundStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
    },
    onError: (assignError) => {
      // 409·400 = 화면의 상세가 낡았을 수 있다(400 은 지워진 슬롯) — return 하면 재조회가 끝날 때까지 오류 기록·호출부 안내가 밀린다.
      if (assignError instanceof ApiError && (assignError.status === 409 || assignError.status === 400)) {
        void queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(roundId) });
      }
    },
  });
}

/**
 * 배정 해제 (BE#11 — 배정 검토 단계 한정)
 * 성공 → detail(roundId) invalidate
 */
export function useUnassignMemberScheduleMutation(roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number) =>
      client.interviewRounds.unassignMemberSchedule(roundId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
    },
  });
}

/**
 * 멤버 제외 (BE#11)
 * 성공 → detail(roundId) + list(recruitmentId) + candidates(recruitmentId) + 통계 invalidate
 * (제외 시 멤버 대기열 복귀 — 재큐잉이므로 candidates 포함 §10.1)
 * 409 → detail(roundId) invalidate (화면의 상세가 낡았을 수 있다 — 결과가 정해져 이미 제외된 멤버 등)
 */
export function useExcludeMemberMutation(recruitmentId: number, roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number) =>
      client.interviewRounds.excludeMember(roundId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.list(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.candidates(recruitmentId),
      });
      // 자동 마감 전망(통계 요약)은 결과를 기다리는 사람이 남은 라운드만 센다 — 기다리던 마지막 멤버를 빼면 진행 중 라운드 수가 바뀐다.
      queryClient.invalidateQueries({ queryKey: statsQueryKeys.byRecruitment(recruitmentId) });
    },
    onError: (excludeError) => {
      // 409 = 화면의 상세가 낡았을 수 있다 — return 하면 재조회가 끝날 때까지 오류 기록·호출부 안내가 밀린다.
      if (excludeError instanceof ApiError && excludeError.status === 409) {
        void queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(roundId) });
      }
    },
  });
}

/**
 * 라운드 확정 (BE#11)
 * force=false 시 미처리 멤버가 있으면 409 + ApiError.payload(UnresolvedMembersPayload).
 * force=true 시 미처리 멤버를 자동 제외하고 확정한다.
 * 성공 → detail(roundId) + list(recruitmentId) + candidates(recruitmentId) invalidate
 * (확정 시 상태 전이 + 자동 제외 대기열 복귀)
 * 409 → detail(roundId) invalidate (서버 상태가 화면과 다르다 — 확정 창의 빈 자리 판정용)
 */
export function useConfirmRoundMutation(recruitmentId: number, roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) =>
      client.interviewRounds.confirm(roundId, force),
    // 무효화를 return 하지 않는다 — 현황 화면 포커스 표지가 이 순서에 기댄다(호출부 onSuccess 가 다시 받은 상세보다 먼저 돈다).
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.list(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.candidates(recruitmentId),
      });
      // 확정된 라운드는 더 이상 자동 마감을 막지 않는다 — 모집의 자동 마감 전망(통계 요약)이 바뀐다(#1572).
      queryClient.invalidateQueries({ queryKey: statsQueryKeys.byRecruitment(recruitmentId) });
    },
    onError: (confirmError) => {
      // 409 = 화면의 상세가 낡았다 — 확정 창이 최신 정원·배정으로 빈 자리를 보도록. return 하면 창이 재조회 뒤에야 열린다.
      if (confirmError instanceof ApiError && confirmError.status === 409) {
        void queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(roundId) });
      }
    },
  });
}

/**
 * 재알림 발송 (BE#11 — COLLECTING 단계 미응답자 대상)
 * 성공 → detail(roundId) invalidate
 */
export function useRemindMutation(roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.interviewRounds.remind(roundId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
    },
  });
}

/**
 * 슬롯 수정 (BE#11 — DRAFT·COLLECTING 한정)
 * 성공 → detail(roundId) invalidate
 */
export function useUpdateRoundSlotMutation(roundId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, payload }: { slotId: number; payload: UpdateInterviewSlotPayload }) =>
      client.interviewRounds.updateSlot(slotId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.detail(roundId),
      });
    },
  });
}
