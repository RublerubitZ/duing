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
  const client = useApiClient();
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  return async () => {
    // 토큰을 지우기 전에 서버 세션(token_version)을 폐기한다 — clearSession 이후 호출하면
    // Bearer 헤더가 빠져 서버에서 무효화가 일어나지 않는다. 네트워크 실패가 로컬 로그아웃을
    // 막지 않도록 best-effort 로 처리한다.
    try {
      await client.auth.logout();
    } catch {
      // 서버 폐기 실패(오프라인·5xx 등)해도 로컬 정리는 계속 진행한다.
    }
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
