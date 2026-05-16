import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SubmitApplicationPayload,
  UpdateApplicationStatusPayload,
  UpdateInterviewPayload,
} from '@duing/types';
import { useAuthStore } from '@duing/stores';
import { useApiClient } from './api-context';

export function useSubmitApplication(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitApplicationPayload) =>
      client.applications.submit(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'applications'] });
    },
  });
}

export function useMyApplications() {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: ['users', 'me', 'applications'],
    queryFn: () => client.users.myApplications(),
    enabled: status === 'authenticated',
  });
}

export function useMyApplicationDetail(applicationId: number | undefined) {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: ['users', 'me', 'applications', applicationId],
    queryFn: () => {
      if (applicationId === undefined) {
        throw new Error('applicationId is required');
      }
      return client.applications.myDetail(applicationId);
    },
    enabled: status === 'authenticated' && applicationId !== undefined,
  });
}

export function useApplicants(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['applications', 'applicants', recruitmentId],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.applications.applicants(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useApplicantDetail(applicationId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['applications', 'applicantDetail', applicationId],
    queryFn: () => {
      if (applicationId === undefined) {
        throw new Error('applicationId is required');
      }
      return client.applications.detail(applicationId);
    },
    enabled: applicationId !== undefined,
  });
}

export function useUpdateApplicationStatus(recruitmentId: number) {
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
        queryKey: ['applications', 'applicants', recruitmentId],
      });
      queryClient.invalidateQueries({
        queryKey: ['stats', recruitmentId],
      });
    },
  });
}

export function useUpdateInterview(recruitmentId: number) {
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
        queryKey: ['applications', 'applicants', recruitmentId],
      });
      queryClient.invalidateQueries({
        queryKey: ['stats', recruitmentId],
      });
    },
  });
}
