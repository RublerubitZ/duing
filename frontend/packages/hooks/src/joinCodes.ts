import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkApproveJoinRequestsPayload,
  CreateJoinCodePayload,
  DecideJoinRequestPayload,
  JoinRequestStatus,
} from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';

/**
 * 활성 가입 코드 조회. 활성 코드가 없으면 200 + data:null 이므로 `data === null` 이 "코드 없음"이고
 * 오류가 아니다. 만료된 코드도 폐기 전이면 내려오므로 사용 가능 여부는 화면이 판정한다.
 */
export function useActiveJoinCodeQuery(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.joinCode(clubId) : ['clubs', undefined, 'join-code'],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.joinCodes.getActiveForClub(clubId);
    },
    enabled: clubId !== undefined,
  });
}

export function useCreateJoinCodeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateJoinCodePayload) => client.joinCodes.createForClub(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.joinCode(clubId) });
    },
  });
}

export function useRevokeJoinCodeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (joinCodeId: number) => client.joinCodes.revokeForClub(clubId, joinCodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.joinCode(clubId) });
    },
  });
}

export function useJoinRequestsQuery(clubId: number | undefined, status: JoinRequestStatus) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined
        ? clubQueryKeys.joinRequests(clubId, status)
        : ['clubs', undefined, 'join-requests', status],
    queryFn: () => {
      if (clubId === undefined) {
        throw new Error('clubId is required');
      }
      return client.joinCodes.listRequests(clubId, status);
    },
    enabled: clubId !== undefined,
  });
}

/** 전화번호가 담긴 상세 — 운영진이 실제로 연 요청 1건에 대해서만 호출한다. */
export function useJoinRequestDetailQuery(
  clubId: number | undefined,
  joinRequestId: number | null,
) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined && joinRequestId !== null
        ? clubQueryKeys.joinRequestDetail(clubId, joinRequestId)
        : ['clubs', clubId, 'join-requests', 'detail', joinRequestId],
    queryFn: () => {
      if (clubId === undefined || joinRequestId === null) {
        throw new Error('clubId and joinRequestId are required');
      }
      return client.joinCodes.getRequestDetail(clubId, joinRequestId);
    },
    enabled: clubId !== undefined && joinRequestId !== null,
  });
}

// 처리 한 건이 요청 목록·회원 명단·코드 사용량(usedCount)을 함께 바꾸므로 셋 다 무효화한다.
function invalidateAfterDecision(
  queryClient: ReturnType<typeof useQueryClient>,
  clubId: number,
) {
  queryClient.invalidateQueries({ queryKey: clubQueryKeys.joinRequestsAll(clubId) });
  queryClient.invalidateQueries({ queryKey: clubQueryKeys.members(clubId) });
  queryClient.invalidateQueries({ queryKey: clubQueryKeys.joinCode(clubId) });
}

/**
 * 단건 승인·거절. 승인해도 이미 가입된 회원이면 결과가 `AUTO_REJECTED` 로 돌아오므로
 * 호출부는 반환값의 `result` 를 보고 안내 문구를 갈라야 한다.
 */
export function useDecideJoinRequestMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      joinRequestId,
      payload,
    }: {
      joinRequestId: number;
      payload: DecideJoinRequestPayload;
    }) => client.joinCodes.decideRequest(clubId, joinRequestId, payload),
    onSuccess: () => invalidateAfterDecision(queryClient, clubId),
  });
}

/**
 * 학생용 코드 확인(`/join/{code}`). 비로그인도 호출하는 공개 조회다.
 * 없는 코드의 404 는 화면이 "유효하지 않은 코드"로 읽는 정상 결과라 에러 상태로 그대로 노출한다.
 */
export function useJoinCodeCheckQuery(code: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.joinCodeCheck(code),
    queryFn: () => client.joinCodes.check(code),
    // 404 는 재시도해도 결과가 같다 — 전역 정책(1회 재시도)을 여기서만 끈다.
    retry: false,
  });
}

/**
 * 학생용 가입 요청 생성. 성공하면 확인 결과가 PENDING 으로 바뀌므로 같은 코드의 확인을 무효화한다.
 * 실패(409: 다른 탭에서 이미 요청·방금 소진)도 화면이 서버 상태보다 뒤처졌다는 신호라 같이 무효화한다.
 */
export function useCreateJoinRequestMutation(code: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.joinCodes.createRequest(code),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.joinCodeCheck(code) });
    },
  });
}

/** 일괄 승인. 건별 트랜잭션이라 일부 실패가 정상 결과이며 실패 사유는 응답으로만 알 수 있다. */
export function useBulkApproveJoinRequestsMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkApproveJoinRequestsPayload) =>
      client.joinCodes.bulkApproveRequests(clubId, payload),
    onSuccess: () => invalidateAfterDecision(queryClient, clubId),
  });
}
