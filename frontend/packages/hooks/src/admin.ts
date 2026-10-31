import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminClubSearchParams,
  AdminUpdateClubPayload,
  ForceRevokeJoinCodePayload,
  AdminUserSearchParams,
  ChangeUserStatusPayload,
  CloseClubPayload,
  CreateClubPayload,
  UpdateAdminNotePayload,
  UpdateClubCentralClubPayload,
  UpdateClubFacilitySecuredTimeTargetPayload,
  UpdateClubStatusPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';
import { clubQueryKeys } from './clubQueryKeys';
import { facilityQueryKeys } from './facilityQueryKeys';

/**
 * 콘솔 사이드바 뱃지용 미처리 건수. 전역 staleTime(30초)을 그대로 써서, 사이드바가 다시 마운트되거나
 * 캐시가 만료된 뒤 진입하면 자연스럽게 갱신된다(폴링 없음). 처리 직후 반영은 각 도메인 뮤테이션이
 * 이 키를 무효화해 담당한다.
 */
export function useAdminPendingCountsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.pendingCounts(),
    queryFn: () => client.admin.pendingCounts(),
  });
}

/**
 * 총동연 홈 처리 대기 추이. 키가 pendingCounts() 아래라 처리 뮤테이션의 pendingCounts 무효화가 이 쿼리도 다시
 * 불러온다(접수·처리 숫자가 처리 직후 바뀐다). staleTime 은 pending-counts 와 같은 전역 기본값.
 */
export function useAdminPendingTrendQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.pendingTrend(),
    queryFn: () => client.admin.pendingTrend(),
  });
}

/** 자동 작업 상태를 다시 받는 주기 — 10분 잡의 판정 단위(30분)보다 충분히 짧다. */
export const ADMIN_JOB_STATUSES_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 총동연 홈 자동 작업 상태. 앱 전역 기본값은 창 포커스 때 다시 받지 않아(providers.tsx), 그대로 두면 홈을 열어 둔 채로는
 * "늦음"이 끝내 나타나지 않고 상대 시각("8분 전")도 멈춘다 — 포커스·5분 주기로 다시 받는다(useUnreadCountQuery 전례).
 */
export function useAdminJobStatusesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.jobStatuses(),
    queryFn: () => client.admin.jobStatuses(),
    refetchOnWindowFocus: true,
    refetchInterval: ADMIN_JOB_STATUSES_REFETCH_INTERVAL_MS,
  });
}

export function useAdminClubsQuery(params: AdminClubSearchParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.clubsList(params),
    queryFn: () => client.admin.clubs.list(params),
  });
}

export function useAdminClubDetailQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? adminQueryKeys.clubsDetail(clubId) : ['admin', 'clubs', 'detail', undefined],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.admin.clubs.detail(clubId);
    },
    enabled: clubId !== undefined,
  });
}

/**
 * 학교 제출용 동아리원 명단(총동연). clubId 가 있을 때만 조회한다 — 전사 콕핏에서 현재 예약의
 * 동아리 명단을 펼칠 때 쓴다. 명단은 자주 바뀌지 않으므로 전역 staleTime(30초)을 그대로 쓴다.
 */
export function useAdminClubMembersQuery(clubId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== null ? adminQueryKeys.clubMembers(clubId) : ['admin', 'clubs', 'members', null],
    queryFn: () => {
      if (clubId === null) {
        throw new Error('clubId is required');
      }
      return client.admin.clubs.members(clubId);
    },
    enabled: clubId !== null,
  });
}

export type AdminUserSearchOptions = { allowEmptyQuery?: boolean };

/**
 * 검색 실행 여부. 회원 관리 목록은 검색어 없이도 상태 필터만으로 조회해야 하지만,
 * 같은 훅을 쓰는 동아리장 검색 콤보박스는 열자마자 전체 회원을 드롭다운에 쏟아내면 안 된다.
 * 그래서 게이트를 상태 파라미터로 추론하지 않고 호출 측이 명시적으로 연다.
 */
export function shouldRunAdminUserSearch(
  query: string,
  options: AdminUserSearchOptions | undefined,
): boolean {
  return options?.allowEmptyQuery === true || query.trim().length > 0;
}

/**
 * 회원 검색. 기본은 검색어가 있어야만 실행하며, 빈 검색은 호출 측이 allowEmptyQuery 로 연다.
 */
export function useAdminUserSearchQuery(
  params: AdminUserSearchParams,
  options?: AdminUserSearchOptions,
) {
  const client = useApiClient();
  const trimmedQuery = (params.q ?? '').trim();
  const normalizedParams = { ...params, q: trimmedQuery.length > 0 ? trimmedQuery : undefined };
  return useQuery({
    queryKey: adminQueryKeys.usersSearch(normalizedParams),
    queryFn: () => client.admin.users.search(normalizedParams),
    enabled: shouldRunAdminUserSearch(trimmedQuery, options),
  });
}

export function useAdminUserDetailQuery(userId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      userId !== undefined ? adminQueryKeys.usersDetail(userId) : ['admin', 'users', 'detail', undefined],
    queryFn: () => {
      if (userId === undefined) {
        throw new Error('userId is required');
      }
      return client.admin.users.detail(userId);
    },
    enabled: userId !== undefined,
  });
}

/** 상태 변경 후 상세와 목록을 함께 무효화한다 — 요구사항의 "목록 즉시 갱신". */
export function useAdminUserStatusMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...payload }: { userId: number } & ChangeUserStatusPayload) =>
      client.admin.users.changeStatus(userId, payload),
    onSuccess: () => {
      // usersAll(['admin','users'])은 usersDetail(['admin','users','detail',id])의 접두사라 상세까지 함께 덮는다.
      // 둘을 나란히 호출하면 cancelRefetch 기본값 때문에 상세의 첫 재조회가 취소되고 다시 나가 요청이 두 번이 된다.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersAll });
    },
  });
}

/** 메모 저장은 상세만 무효화한다 — 목록에는 메모가 표시되지 않는다. */
export function useAdminUserNoteMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, note }: { userId: number } & UpdateAdminNotePayload) =>
      client.admin.users.updateNote(userId, { note }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersDetail(variables.userId) });
    },
  });
}

/**
 * 원본 번호 조회. GET 이지만 useQuery 가 아니라 useMutation 을 쓴다 — 쿼리로 받으면 원본 번호가
 * React Query 캐시에 gcTime 동안 남아 패널을 닫아도 살아 있다(기존 useMemberPhoneMutation 과 같은 이유).
 */
export function useAdminUserPhoneMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (userId: number) => client.admin.users.phone(userId),
    // 이 훅만 gcTime 을 0 으로 둔다 — 결과가 원본 개인정보라 기본값(5분)이면 화면이 읽지 않아도
    // 뮤테이션 캐시에 그만큼 상주한다. 옵저버가 떨어지는 즉시 버려 필요 이상으로 들고 있지 않는다.
    gcTime: 0,
  });
}

/**
 * 회원 강제 로그아웃. 대상의 tokenVersion 을 범프해 전 세션·리프레시를 폐기한다.
 * 검색 결과 캐시(usersSearch)는 세션 상태를 담지 않으므로 무효화하지 않지만,
 * 상세는 조치 이력에 이 건이 새로 쌓이므로 무효화한다.
 */
export function useAdminForceLogoutMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => client.admin.users.forceLogout(userId),
    onSuccess: (_result, userId) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersDetail(userId) });
    },
  });
}

export function useCreateClubMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClubPayload) => client.clubs.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
      // 새 동아리는 승인 대기로 생성되므로 뱃지가 늘어야 한다.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
    },
  });
}

export function useUpdateClubStatusMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: UpdateClubStatusPayload }) =>
      client.clubs.updateStatus(clubId, payload),
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubActivityEventsAll(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
      // 사이드바 뱃지 — 승인/반려 즉시 승인 대기 수가 줄어야 한다.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
      // 운영 중단 전환은 진행 중 모집을 일괄 마감한다 — 총동연 홈 대기열·모집 목록에 마감된 모집이 남지 않게.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.recruitmentsAll });
    },
  });
}

export function useCloseClubMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: CloseClubPayload }) =>
      client.clubs.close(clubId, payload),
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubActivityEventsAll(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
      // 폐쇄는 대기 승계 취소·모집 마감·홍보 요청 반려를 함께 한다 — 사이드바 배지·총동연 홈 대기열에 처리된 건이 남지 않게.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.recruitmentsAll });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.leaderSuccessionAll });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotionRequestsAll });
    },
  });
}

/**
 * 운영 중단 동아리의 남은 미결 정리(결과 미정 지원서 불합격·대기 가입 신청 거절). 성공·실패 모두 무효화한다 —
 * 응답을 못 받았지만 서버는 커밋했거나(타임아웃), 409(그사이 재활성·동시 수정)로 끝나 목록이 낡았을 때 스스로 맞춘다(bank.ts 선례).
 */
export function useCleanupClubPendingMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clubId: number) => client.admin.clubs.cleanupPending(clubId),
    onSettled: (_cleanupResult, _cleanupError, clubId) => {
      // 동아리 목록·총동연 홈 대기열(두 목록 모두 clubsList)
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      // 사이드바 배지·홈 칸 — 접두 아래 추이도 함께
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
      // 총동연 모집 목록 미처리 열·지원자 목록·지원서 상세
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.recruitmentsAll });
      // 가입 신청 거절 감사 행
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubActivityEventsAll(clubId) });
      // 총동연 가입 링크 목록 — 링크 사용 수·대기 수
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubJoinCodes(clubId) });
    },
  });
}

export function useUpdateClubCentralClubMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: UpdateClubCentralClubPayload }) =>
      client.clubs.updateCentralClub(clubId, payload),
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
  });
}

export function useUpdateClubFacilitySecuredTimeTargetMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: number; payload: UpdateClubFacilitySecuredTimeTargetPayload }) =>
      client.clubs.updateFacilitySecuredTimeTarget(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      // 분류는 조회 시점 파생이라 플래그 변경 즉시 가용성·크롤 현황 표기가 바뀐다 — 함께 무효화.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilityCrawlAll });
      queryClient.invalidateQueries({ queryKey: facilityQueryKeys.availabilityAll() });
      // 비차단 전환(2026-08-27)으로 큐 파생(충돌 의심 배지)·요약 KPI 도 토글에 반응한다 — 큐·summary 공통 프리픽스 무효화.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilityBookingsAll });
    },
  });
}

export function useAdminUpdateClubMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdminUpdateClubPayload) => client.admin.clubs.update(clubId, payload),
    onSuccess: (updated) => {
      // 관리자 상세는 반환값으로 즉시 갱신, 나머지 관리자/공개 목록·상세는 무효화해 재조회.
      queryClient.setQueryData(adminQueryKeys.clubsDetail(clubId), updated);
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubsAll });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
  });
}

/**
 * 총동연이 보는 동아리 가입 링크 이력(모집·부원 초대 2종, 폐기·만료 포함).
 * 페이지네이션이 없어 파라미터 축도 없다 — 키는 동아리 하나로 끝난다.
 */
export function useAdminClubJoinCodesQuery(clubId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.clubJoinCodes(clubId),
    queryFn: () => client.admin.clubJoinCodes.list(clubId),
  });
}

/**
 * 가입 링크 강제 폐기. 폐기는 링크 목록의 상태를 바꾸고 동시에 활동 이력에
 * `JOIN_LINK_FORCE_REVOKED` 행을 남기므로 두 곳을 함께 무효화한다.
 */
export function useForceRevokeAdminClubJoinCodeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      joinCodeId,
      payload,
    }: {
      joinCodeId: number;
      payload: ForceRevokeJoinCodePayload;
    }) => client.admin.clubJoinCodes.forceRevoke(clubId, joinCodeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubJoinCodes(clubId) });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clubActivityEventsAll(clubId) });
    },
  });
}
