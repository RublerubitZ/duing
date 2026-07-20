import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@duing/stores';
import type {
  ChangePasswordPayload,
  ChangePhonePayload,
  CompletePasswordResetPayload,
  LoginPayload,
  MySession,
  RequestPasswordResetPayload,
  SignupPayload,
  StartPhoneVerificationPayload,
  UpdateProfilePayload,
  User,
} from '@duing/types';
import { useApiClient } from './api-context';
import { authQueryKeys } from './authQueryKeys';
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LoginPayload) => client.auth.login(payload),
    onSuccess: (user) => {
      // 로그인 페이지가 세션 보유 상태에서도 열리므로(사용자 전환), 이전 계정의 캐시가
      // 새 계정 화면에 노출되지 않도록 로그아웃 경로들과 동일하게 비운 뒤 세션을 연다.
      queryClient.clear();
      setSession(user);
    },
  });
}

export function useLogout() {
  const client = useApiClient();
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  return async () => {
    await client.auth.logout();
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

export function useMySessionsQuery() {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery<MySession[]>({
    queryKey: userQueryKeys.sessions(),
    queryFn: () => client.users.sessions(),
    enabled: status === 'authenticated',
  });
}

export function useRevokeSessionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => client.users.revokeSession(sessionId),
    // onSettled — 실패(404: 이미 폐기된 세션 등)에도 목록을 재조회해 유령 행이 남지 않게 한다.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.sessions() });
    },
  });
}

export function useLogoutAllMutation() {
  const client = useApiClient();
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.users.logoutAllSessions(),
    onSuccess: async () => {
      await clearSession();
      queryClient.clear();
    },
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

export function useStartPhoneVerificationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ payload, includeQr }: { payload: StartPhoneVerificationPayload; includeQr: boolean }) =>
      client.auth.startPhoneVerification(payload, includeQr),
  });
}

export function useStartPhoneChangeVerificationMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ payload, includeQr }: { payload: StartPhoneVerificationPayload; includeQr: boolean }) =>
      client.users.startPhoneChangeVerification(payload, includeQr),
  });
}

export function useChangePhoneMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChangePhonePayload) => client.users.changePhone(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.me() });
    },
  });
}

export function useRequestPasswordResetMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ payload, includeQr }: { payload: RequestPasswordResetPayload; includeQr: boolean }) =>
      client.auth.requestPasswordReset(payload, includeQr),
  });
}

export function useCompletePasswordResetMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: CompletePasswordResetPayload) => client.auth.completePasswordReset(payload),
  });
}

// 서버 상태를 3초 간격으로 폴링한다. VERIFIED/EXPIRED 로 확정되면 refetchInterval=false 로 스스로 멈추고,
// 백그라운드 탭에서는 폴링하지 않는다. enabled 는 "문자 보냈어요" 를 누른 뒤(waiting)에만 true 로 넘긴다.
export function usePhoneVerificationStatusQuery(
  verificationToken: string | null,
  options: { enabled: boolean },
) {
  const client = useApiClient();
  return useQuery({
    queryKey: authQueryKeys.phoneVerification(verificationToken ?? ''),
    queryFn: () => {
      if (verificationToken === null) throw new Error('verificationToken is null');
      return client.auth.getPhoneVerificationStatus(verificationToken);
    },
    enabled: options.enabled && verificationToken !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'VERIFIED' || status === 'EXPIRED' ? false : 3000;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
  });
}
