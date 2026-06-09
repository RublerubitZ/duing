import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './api-context';
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
// Mutations — invalidation matrix (spec §6)
//   createConfig / updateConfig  → config
//   createSlots                  → slots + candidates + applicantSlots
//   updateSlot / deleteSlot      → slots + candidates + schedules + applicantSlots
//   autoAssign                   → config + schedules + candidates
//   assignSchedule               → schedules + candidates
//   cancelSchedule               → schedules
//   updateAvailabilities         → mySchedule + availabilities
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
    },
  });
}

export function useAssignInterviewScheduleMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { applicationId: number; slotId: number }) =>
      client.interviews.assignSchedule(args.applicationId, { slotId: args.slotId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.schedules(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.candidates(recruitmentId),
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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewQueryKeys.schedules(recruitmentId),
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
    },
  });
}
