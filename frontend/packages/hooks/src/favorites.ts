import type { FavoriteIds } from '@duing/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './api-context';
import { favoriteQueryKeys } from './favoriteQueryKeys';

type FavoriteToggleContext = {
  previousIds: FavoriteIds | undefined;
};

export function useFavoriteListQuery(page = 0, size = 20) {
  const client = useApiClient();
  return useQuery({
    queryKey: favoriteQueryKeys.list(page, size),
    queryFn: () => client.favorites.list(page, size),
  });
}

export function useFavoriteIdsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: favoriteQueryKeys.ids(),
    queryFn: () => client.favorites.ids(),
    select: (favoriteIds) => favoriteIds.clubIds,
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
    },
  });
}
