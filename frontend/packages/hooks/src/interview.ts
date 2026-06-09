import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './api-context';
import { applicationQueryKeys } from './applicationQueryKeys';
import { interviewQueryKeys } from './interviewQueryKeys';

// =====================================================================
// Queries
// =====================================================================

export function useInterviewConfigQuery(recruitmentId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewQueryKeys.config(recruitmentId),
    queryFn: () => client.interviews.getConfig(recruitmentId),
  });
}

export function useInterviewSlotsQuery(recruitmentId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewQueryKeys.slots(recruitmentId),
    queryFn: () => client.interviews.listSlots(recruitmentId),
  });
}

// Step 3/4 컴포넌트가 진입 가능한 step 일 때만 fetch 하도록 enabled 옵션 노출.
// 기본값 true 로 두어 기존 호출부의 동작은 동일하게 유지된다.
export function useInterviewSchedulesQuery(
  recruitmentId: number,
  options: { enabled?: boolean } = {},
) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewQueryKeys.schedules(recruitmentId),
    queryFn: () => client.interviews.listSchedules(recruitmentId),
    enabled: options.enabled ?? true,
  });
}

export function useMatchingCandidatesQuery(
  recruitmentId: number,
  options: { enabled?: boolean } = {},
) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewQueryKeys.candidates(recruitmentId),
    queryFn: () => client.interviews.matchingCandidates(recruitmentId),
    enabled: options.enabled ?? true,
  });
}

export function useApplicantInterviewSlotsQuery(recruitmentId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewQueryKeys.applicantSlots(recruitmentId),
    queryFn: () => client.interviews.applicantSlots(recruitmentId),
  });
}

export function useInterviewAvailabilitiesQuery(applicationId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewQueryKeys.availabilities(applicationId),
    queryFn: () => client.interviews.getAvailabilities(applicationId),
  });
}

export function useMyInterviewScheduleQuery(applicationId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewQueryKeys.mySchedule(applicationId),
    queryFn: () => client.interviews.mySchedule(applicationId),
  });
}

// =====================================================================
// Mutations — invalidation matrix (spec §6 + P0 FE foundation)
//   createConfig / updateConfig  → config
//   createSlots                  → slots + candidates + applicantSlots
//   updateSlot / deleteSlot      → slots + candidates + schedules + applicantSlots
//   autoAssign                   → config + schedules + candidates + slots
//                                  + applicationQueryKeys.all (운영진 list/detail/neighbors)
//                                  + applicationQueryKeys.allMyLists (지원자 my-page)
//   assignSchedule               → slots + schedules + candidates
//                                  + applicantDetail(applicationId)
//                                  + myDetail(applicationId)
//   cancelSchedule               → slots + schedules + candidates
//                                  + applicantDetail(applicationId)
//                                  + myDetail(applicationId)
//   updateAvailabilities         → mySchedule + availabilities
//                                  + applicantDetail(applicationId)
//                                  + myDetail(applicationId)   ※ availabilityCount 변경 반영
//
// 수동 배정/취소(assign/cancel) 도 slots 의 assignedCount 를 변동시키므로 slots 도 invalidate 한다.
// 누락 시 운영진이 슬롯 A 배정 → 모달 닫기 → 다른 지원자 재오픈 시 slots 가 stale 한
// assignedCount 로 full 판정이 어긋나 409 가 날 수 있다.
//
// 추가로 Spec P0 에서 ApplicantDetail(`assignedSlot`/`interviewAvailabilities`) 와
// MyApplicationDetail(`interviewScheduleAssigned`) 가 배정/취소에 의해 변하므로
// 두 detail query 도 함께 invalidate 한다.
//
// autoAssign 은 모든 지원자의 assignedSlot / interviewScheduleAssigned 를 한꺼번에
// 바꾸므로 applicationId 단위 invalidation 은 불가능하다. 운영진 측은 application
// 도메인 prefix(`applicationQueryKeys.all` = ['applications']) 로, 지원자 측은
// my-page prefix(`applicationQueryKeys.allMyLists` = ['users','me','applications']) 로
// broad invalidate 한다. 두 prefix 가 서로 disjoint 하여 둘 다 명시적으로 호출해야 한다.
// =====================================================================

export function useCreateInterviewConfigMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof client.interviews.createConfig>[1]) =>
      client.interviews.createConfig(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.config(recruitmentId),
      });
    },
  });
}

export function useUpdateInterviewConfigMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof client.interviews.updateConfig>[1]) =>
      client.interviews.updateConfig(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.config(recruitmentId),
      });
    },
  });
}

export function useCreateInterviewSlotsMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof client.interviews.createSlots>[1]) =>
      client.interviews.createSlots(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.slots(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.candidates(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.applicantSlots(recruitmentId),
      });
    },
  });
}

export function useUpdateInterviewSlotMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      slotId: number;
      payload: Parameters<typeof client.interviews.updateSlot>[1];
    }) => client.interviews.updateSlot(args.slotId, args.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.slots(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.candidates(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.schedules(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.applicantSlots(recruitmentId),
      });
    },
  });
}

export function useDeleteInterviewSlotMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slotId: number) => client.interviews.deleteSlot(slotId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.slots(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.candidates(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.schedules(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.applicantSlots(recruitmentId),
      });
    },
  });
}

export function useAutoAssignMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.interviews.autoAssign(recruitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.config(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.schedules(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.candidates(recruitmentId),
      });
      // 자동배정으로 슬롯 assignedCount 가 일괄 변동하므로 slots 도 무효화한다.
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.slots(recruitmentId),
      });
      // 운영진 ApplicantDetail / list / neighbors 모두 assignedSlot 이 변경되므로
      // application 도메인 전체 prefix 로 broad invalidate.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.all,
      });
      // 지원자 my-page (interviewScheduleAssigned) 도 동시 갱신.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.allMyLists,
      });
    },
  });
}

export function useAssignInterviewScheduleMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { applicationId: number; slotId: number }) =>
      client.interviews.assignSchedule(args.applicationId, { slotId: args.slotId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.slots(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.schedules(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.candidates(recruitmentId),
      });
      // 운영진 ApplicantDetail (assignedSlot/interviewAvailabilities) 갱신.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantDetail(variables.applicationId),
      });
      // 지원자 stepper (interviewScheduleAssigned) 갱신.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.myDetail(variables.applicationId),
      });
    },
  });
}

export function useCancelInterviewScheduleMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: number) =>
      client.interviews.cancelSchedule(applicationId),
    onSuccess: (_data, applicationId) => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.slots(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.schedules(recruitmentId),
      });
      // 슬롯 정원이 다시 가용해지므로 candidates 재계산도 의미 있다.
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.candidates(recruitmentId),
      });
      // 운영진 ApplicantDetail (assignedSlot → null) 갱신.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantDetail(applicationId),
      });
      // 지원자 stepper (interviewScheduleAssigned → false) 갱신.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.myDetail(applicationId),
      });
    },
  });
}

export function useUpdateInterviewAvailabilitiesMutation(applicationId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { slotIds: number[] }) =>
      client.interviews.updateAvailabilities(applicationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.mySchedule(applicationId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.availabilities(applicationId),
      });
      // 운영진 ApplicantDetail.interviewAvailabilities 갱신.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicantDetail(applicationId),
      });
      // 지원자 stepper (MyApplicationDetail.interviewAvailabilityCount) 갱신.
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.myDetail(applicationId),
      });
    },
  });
}
