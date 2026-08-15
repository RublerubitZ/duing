import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplicationDraft, UpsertDraftPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { draftQueryKeys } from './draftQueryKeys';

export function useApplicationDraftQuery(recruitmentId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: draftQueryKeys.byRecruitment(recruitmentId),
    queryFn: () => client.drafts.get(recruitmentId),
  });
}

export function useApplicationDraftMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertDraftPayload) => client.drafts.upsert(recruitmentId, payload),
    // 자동저장은 입력이 멈출 때마다 반복 발화한다. 여기서 invalidate 하면 지원서 화면에 떠 있는
    // 조회 훅이 곧바로 재조회해, 방금 올려보낸 답변 전문이 GET 응답으로 그대로 되돌아온다(순수 낭비).
    // PUT 은 204(본문 없음)라 서버 에코가 없지만, 저장에 성공한 payload 자체가 곧 서버 상태이므로
    // 그 값으로 캐시를 직접 맞추고 재조회는 하지 않는다. 저장 시각은 화면의 "마지막 저장" 표기와
    // 같은 기준(클라이언트 시계)으로 채운다.
    onSuccess: (_noContent, savedPayload) => {
      queryClient.setQueryData<ApplicationDraft>(draftQueryKeys.byRecruitment(recruitmentId), {
        exists: true,
        answers: savedPayload.answers,
        updatedAt: new Date().toISOString(),
      });
    },
  });
}

export function useDeleteApplicationDraftMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.drafts.remove(recruitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: draftQueryKeys.byRecruitment(recruitmentId),
      });
    },
  });
}
