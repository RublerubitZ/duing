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
      if (context?.previousIds !== undefined) {
        queryClient.setQueryData(favoriteQueryKeys.ids(), context.previousIds);
      }
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
