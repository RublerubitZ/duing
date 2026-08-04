import type { ClubSearchParams, JoinRequestStatus } from '@duing/types';

export const clubQueryKeys = {
  all: ['clubs'] as const,
  list: (params: ClubSearchParams) => [...clubQueryKeys.all, params] as const,
  detail: (clubId: number) => [...clubQueryKeys.all, clubId] as const,
  photos: (clubId: number) => [...clubQueryKeys.all, clubId, 'photos'] as const,
  heroActivities: (clubId: number) => [...clubQueryKeys.all, clubId, 'hero-activities'] as const,
  recruitments: (clubId: number) => [...clubQueryKeys.all, clubId, 'recruitments'] as const,
  members: (clubId: number) => [...clubQueryKeys.all, clubId, 'members'] as const,
  // 코드는 모집에 귀속된다 — 요청 콘솔(클럽 단위)은 어느 모집의 코드가 바뀌는지 모르므로
  // 프리픽스로 한 번에 무효화하고, 조회는 모집까지 포함한 키를 쓴다.
  joinCodesAll: (clubId: number) => [...clubQueryKeys.all, clubId, 'join-code'] as const,
  joinCode: (clubId: number, recruitmentId: number) =>
    [...clubQueryKeys.joinCodesAll(clubId), recruitmentId] as const,
  // 상태별 목록·상세를 한 번에 무효화하기 위한 공통 프리픽스 — 처리 한 건이 여러 탭의 목록을 동시에 바꾼다.
  joinRequestsAll: (clubId: number) => [...clubQueryKeys.all, clubId, 'join-requests'] as const,
  joinRequests: (clubId: number, status: JoinRequestStatus) =>
    [...clubQueryKeys.joinRequestsAll(clubId), status] as const,
  joinRequestDetail: (clubId: number, joinRequestId: number) =>
    [...clubQueryKeys.joinRequestsAll(clubId), 'detail', joinRequestId] as const,
  managed: () => [...clubQueryKeys.all, 'managed'] as const,
  // 학생용 코드 확인은 clubId 를 모른 채 코드로만 조회하므로 clubs 프리픽스에 매달 수 없다.
  joinCodeCheck: (code: string) => ['join-codes', code, 'check'] as const,
};
