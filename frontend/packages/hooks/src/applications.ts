import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubmitApplicationPayload } from '@duing/types';
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
