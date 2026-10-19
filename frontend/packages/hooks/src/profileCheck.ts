import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { selectIsAuthenticated, useAuthStore } from '@duing/stores';
import type { ConfirmProfileCheckPayload, ProfileCheckStatus, User } from '@duing/types';
import { useApiClient } from './api-context';
import { userQueryKeys } from './userQueryKeys';

/** 학기별 정보 확인 팝업 상태 — 로그인 상태일 때만 조회한다(useMeQuery 와 같은 게이트). */
export function useProfileCheckQuery() {
  const client = useApiClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  return useQuery<ProfileCheckStatus>({
    queryKey: userQueryKeys.profileCheck(),
    queryFn: () => client.users.profileCheck(),
    enabled: isAuthenticated,
  });
}

/**
 * 확인 결과. 학년을 보냈는데 서버 학년이 그대로면 다른 기기에서 먼저 확인된 것이다 —
 * 서버는 이미 확인한 학기의 재요청을 204 로 받고 아무것도 바꾸지 않는다(스펙 §5.4 2단계).
 */
export type ConfirmProfileCheckOutcome = 'confirmed' | 'alreadyConfirmedElsewhere';

export function useConfirmProfileCheckMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<ConfirmProfileCheckOutcome, Error, ConfirmProfileCheckPayload>({
    mutationFn: async (payload) => {
      await client.users.confirmProfileCheck(payload);
      if (payload.grade === null) return 'confirmed';
      try {
        // 홈에는 me 구독자가 없을 수 있어 무효화 대신 직접 받는다 — 받은 값이 me 캐시도 새 학년으로 바꾼다.
        const me = await queryClient.fetchQuery<User>({
          queryKey: userQueryKeys.me(),
          queryFn: () => client.users.me(),
          staleTime: 0,
        });
        return me.grade === payload.grade ? 'confirmed' : 'alreadyConfirmedElsewhere';
      } catch {
        // 확인은 이미 끝났다 — 재조회 실패로 성공을 실패로 뒤집지 않는다. 다만 서버 학년은 바뀌었을 수 있으니
        // me 를 stale 로 표시해 다음 구독(마이페이지·설정)이 다시 받게 한다(staleTime 30초·포커스 재조회 꺼짐).
        void queryClient.invalidateQueries({ queryKey: userQueryKeys.me() });
        return 'confirmed';
      }
    },
    // 성공·실패(기간 종료 409 포함) 모두 서버의 최신 팝업 상태로 다시 맞춘다.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: userQueryKeys.profileCheck() });
    },
  });
}
