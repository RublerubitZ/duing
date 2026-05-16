import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SubmitApplicationPayload,
  UpdateApplicationStatusPayload,
  UpdateInterviewPayload,
} from '@duing/types';
import { useAuthStore } from '@duing/stores';
import { useApiClient } from './api-context';
import { applicationQueryKeys } from './applicationQueryKeys';
import { statsQueryKeys } from './statsQueryKeys';

export function useSubmitApplicationMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitApplicationPayload) =>
      client.applications.submit(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationQueryKeys.myList() });
    },
  });
}

export function useMyApplicationsQuery() {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: applicationQueryKeys.myList(),
    queryFn: () => client.users.myApplications(),
    enabled: status === 'authenticated',
  });
}

export function useMyApplicationDetailQuery(applicationId: number | undefined) {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey:
      applicationId !== undefined
        ? applicationQueryKeys.myDetail(applicationId)
        : ['users', 'me', 'applications', undefined],
    queryFn: () => {
      if (applicationId === undefined) {
        throw new Error('applicationId is required');
      }
      return client.applications.myDetail(applicationId);
    },
    enabled: status === 'authenticated' && applicationId !== undefined,
  });
}

export function useApplicantsQuery(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      recruitmentId !== undefined
        ? applicationQueryKeys.applicants(recruitmentId)
        : ['applications', 'applicants', undefined],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.applications.applicants(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useApplicantDetailQuery(applicationId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      applicationId !== undefined
        ? applicationQueryKeys.applicantDetail(applicationId)
        : ['applications', 'applicantDetail', undefined],
    queryFn: () => {
      if (applicationId === undefined) {
        throw new Error('applicationId is required');
      }
      return client.applications.detail(applicationId);
    },
    enabled: applicationId !== undefined,
  });
}

export function useUpdateApplicationStatusMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      payload,
    }: {
      applicationId: number;
      payload: UpdateApplicationStatusPayload;
    }) => client.applications.updateStatus(applicationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicants(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: statsQueryKeys.byRecruitment(recruitmentId),
      });
    },
  });
}

export function useUpdateInterviewMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      payload,
    }: {
      applicationId: number;
      payload: UpdateInterviewPayload;
    }) => client.applications.updateInterview(applicationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.applicants(recruitmentId),
      });
      queryClient.invalidateQueries({
        queryKey: statsQueryKeys.byRecruitment(recruitmentId),
      });
    },
  });
}