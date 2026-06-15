import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@duing/stores';
import type {
  ChangePasswordPayload,
  ConfirmEmailVerificationPayload,
  LoginPayload,
  SendEmailVerificationPayload,
  SignupPayload,
  UpdateProfilePayload,
  User,
} from '@duing/types';
import { useApiClient } from './api-context';
import { userQueryKeys } from './userQueryKeys';

export function useSignupMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: SignupPayload) => client.auth.signup(payload),
  });
}

export function useLoginMutation() {
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

export function useMeQuery() {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery<User>({
    queryKey: userQueryKeys.me(),
    queryFn: () => client.users.me(),
    enabled: status === 'authenticated',
  });
}

export function useUpdateProfileMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => client.users.updateProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.me() });
    },
  });
}

export function useChangePasswordMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => client.users.changePassword(payload),
  });
}

export function useWithdrawAccountMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.users.withdraw(),
  });
}

export function useSendEmailVerificationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: SendEmailVerificationPayload) =>
      client.auth.sendEmailVerification(payload),
  });
}

export function useConfirmEmailVerificationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: ConfirmEmailVerificationPayload) =>
      client.auth.confirmEmailVerification(payload),
  });
}
