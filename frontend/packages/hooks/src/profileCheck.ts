import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { selectIsAuthenticated, useAuthStore } from '@duing/stores';
import type { ConfirmProfileCheckPayload, ProfileCheckStatus, User } from '@duing/types';
import { useApiClient } from './api-context';
import { retryUnlessStatuses } from './retry';
import { userQueryKeys } from './userQueryKeys';

// 404 는 API 가 아직 없다는 뜻이다(FE 선배포·BE 롤백 중) — 다시 물어도 같아 방문마다 요청·WARN 이 두 배가 될 뿐이다.
const retryUnlessNotFound = retryUnlessStatuses(404);

/** 학기별 정보 확인 팝업 상태 — 로그인 상태일 때만 조회한다(useMeQuery 와 같은 게이트). */
export function useProfileCheckQuery() {
  const client = useApiClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  return useQuery<ProfileCheckStatus>({
    queryKey: userQueryKeys.profileCheck(),
    queryFn: () => client.users.profileCheck(),
    enabled: isAuthenticated,
    retry: retryUnlessNotFound,
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
    // 실패해도(시간 초과 등) 서버는 학년을 올리고 커밋했을 수 있다 — 옛 학년이 "정보 수정하기" 시드로 쓰여 저장 때
    // 학년을 되돌리지 않게 내 정보를 다시 받게 한다. 같은 접두의 다른 쿼리(팝업 상태는 아래에서, 내 동아리 등)는 건드리지 않는다.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: userQueryKeys.me(), exact: true });
    },
    // 성공·실패(기간 종료 409 포함) 모두 서버의 최신 팝업 상태로 다시 맞춘다.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: userQueryKeys.profileCheck() });
    },
  });
}
