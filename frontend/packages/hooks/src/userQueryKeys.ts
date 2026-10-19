export const userQueryKeys = {
  all: ['users'] as const,
  me: () => [...userQueryKeys.all, 'me'] as const,
  myClubs: () => [...userQueryKeys.all, 'me', 'clubs'] as const,
  sessions: () => [...userQueryKeys.all, 'me', 'sessions'] as const,
  // me() 아래에 둔다 — 프로필 수정의 me() 접두 무효화가 팝업 상태도 다시 받게 한다(서버가 저장을 확인으로 기록한다).
  profileCheck: () => [...userQueryKeys.all, 'me', 'profile-check'] as const,
};
