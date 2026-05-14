import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@duing/stores';
import type { LoginPayload, SignupPayload, User } from '@duing/types';
import { useApiClient } from './api-context';

const ME_KEY = ['users', 'me'] as const;

export function useSignup() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: SignupPayload) => client.auth.signup(payload),
  });
}

export function useLogin() {
  const client = useApiClient();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (payload: LoginPayload) => client.auth.login(payload),
    onSuccess: async (result) => {
      await setSession(result.user, result.accessToken);
    },
  });
}

export function useLogout() {
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  return async () => {
    await clearSession();
    queryClient.clear();
  };
}

export function useMe() {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery<User>({
    queryKey: ME_KEY,
    queryFn: () => client.users.me(),
    enabled: status === 'authenticated',
  });
}
