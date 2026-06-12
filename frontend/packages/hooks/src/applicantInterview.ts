// 지원자 면접 진행 훅 — applicantInterview 클라이언트 그룹 소비.
// 쿼리키: interviewRoundKeys.myInterview(applicationId) (스펙 §10.1).
import type { RespondAvailabilityPayload } from '@duing/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './api-context';
import { applicationQueryKeys } from './applicationQueryKeys';
import { interviewRoundKeys } from './interviewRoundQueryKeys';

/**
 * 지원자 본인의 면접 진행 단계 조회 (BE#7)
 * phase + 단계별 화면 데이터(슬롯·마감·일정)를 언래핑해 반환한다.
 * enabled 옵션: 모달이 열렸을 때만 fetch 하도록 호출부에서 제어 가능.
 */
export function useMyInterviewQuery(
  applicationId: number,
  options: { enabled?: boolean } = {},
) {
  const client = useApiClient();
  return useQuery({
    queryKey: interviewRoundKeys.myInterview(applicationId),
    queryFn: () => client.applicantInterview.view(applicationId),
    enabled: options.enabled ?? true,
  });
}

/**
 * 면접 가능 시간 응답 (BE#8 — XOR payload)
 * 성공 시:
 *   - interviewRoundKeys.myInterview(applicationId) invalidate (phase 갱신)
 *   - applicationQueryKeys.myDetail(applicationId) invalidate  (상세 잔여 면접 필드 동기화)
 */
export function useRespondAvailabilityMutation(applicationId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RespondAvailabilityPayload) =>
      client.applicantInterview.respond(applicationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRoundKeys.myInterview(applicationId),
      });
      queryClient.invalidateQueries({
        queryKey: applicationQueryKeys.myDetail(applicationId),
      });
    },
  });
}
