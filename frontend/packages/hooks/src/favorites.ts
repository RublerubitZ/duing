import type { FavoriteIds } from '@duing/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@duing/stores';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
import { favoriteQueryKeys } from './favoriteQueryKeys';

type FavoriteToggleContext = {
  previousIds: FavoriteIds | undefined;
};

export function useFavoriteListQuery(page = 0, size = 20) {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: favoriteQueryKeys.list(page, size),
    queryFn: () => client.favorites.list(page, size),
    enabled: status === 'authenticated',
  });
}

export function useFavoriteIdsQuery() {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: favoriteQueryKeys.ids(),
    queryFn: () => client.favorites.ids(),
    select: (favoriteIds) => favoriteIds.clubIds,
    enabled: status === 'authenticated',
  });
}

export function useFavoriteToggleMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { clubId: number; isFavorited: boolean }, FavoriteToggleContext>({
    mutationFn: async ({ clubId, isFavorited }) => {
      if (isFavorited) {
        await client.favorites.remove(clubId);
      } else {
        await client.favorites.add(clubId);
      }
    },

    onMutate: async ({ clubId, isFavorited }) => {
      await queryClient.cancelQueries({ queryKey: favoriteQueryKeys.ids() });

      const previousIds = queryClient.getQueryData<FavoriteIds>(favoriteQueryKeys.ids());

      queryClient.setQueryData<FavoriteIds>(favoriteQueryKeys.ids(), (current) => {
        const ids = current?.clubIds ?? [];
        const next = isFavorited
          ? ids.filter((id) => id !== clubId)
          : [...ids, clubId];
        return { clubIds: next };
      });

      return { previousIds };
    },

    onError: (_error, _variables, context) => {
      // 세션 종료가 확정되면 만료 핸들러가 이미 캐시 전체를 비웠다(공용 단말 정보 노출 방지).
      // 종료 통지는 이 401 이 표면화되기 전에 동기적으로 스토어를 내리므로, 그 뒤에 이전 값을
      // 복원하면 방금 비운 캐시에 이전 사용자의 찜 목록이 되살아난다.
      const sessionEnded = useAuthStore.getState().status === 'unauthenticated';
      if (!sessionEnded && context?.previousIds !== undefined) {
        queryClient.setQueryData(favoriteQueryKeys.ids(), context.previousIds);
        return;
      }
      // 되돌릴 이전 값이 없거나(세션 확인 중 클릭 등) 세션이 끝난 경우 — 그냥 두면 실패한
      // 토글이 만들어 낸 목록(또는 복원된 이전 사용자 목록)이 비로그인 화면에 채워진 하트로
      // 보인다. 이 쿼리는 미인증이면 enabled:false 라 invalidate 로 지워지지 않으므로
      // 엔트리를 제거한다.
      queryClient.removeQueries({ queryKey: favoriteQueryKeys.ids() });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.ids() });
      queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all });
      // 동아리 목록은 찜에 의존한다(찜 필터 결과·POPULAR 정렬 tier) — 토글 후 재검증해
      // 총 개수·페이지 구성을 서버와 동기화한다. 활성 쿼리만 즉시 refetch 되므로 비용은 국소적.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
  });
}
