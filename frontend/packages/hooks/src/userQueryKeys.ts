export const userQueryKeys = {
  all: ['users'] as const,
  me: () => [...userQueryKeys.all, 'me'] as const,
  myClubs: () => [...userQueryKeys.all, 'me', 'clubs'] as const,
};
