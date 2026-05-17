export const favoriteQueryKeys = {
  all: ['favorites'] as const,
  list: (page: number, size: number) => [...favoriteQueryKeys.all, 'list', { page, size }] as const,
  ids: () => [...favoriteQueryKeys.all, 'ids'] as const,
};
