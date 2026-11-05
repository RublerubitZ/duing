import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplicationDraft, UpsertDraftPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { draftQueryKeys } from './draftQueryKeys';

export function useApplicationDraftQuery(recruitmentId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: draftQueryKeys.byRecruitment(recruitmentId),
    queryFn: () => client.drafts.get(recruitmentId),
    // 남은 캐시로 다시 열리면 폼이 옛 답으로 시작해 다른 곳에서 고친 답을 자동저장이 덮는다 — 자격 조회처럼 떠나면 바로 버린다.
    gcTime: 0,
  });
}

export function useApplicationDraftMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertDraftPayload) => client.drafts.upsert(recruitmentId, payload),
    // 같은 모집의 저장은 앞의 것이 끝난 뒤 이어서 보낸다 — 떠날 때 저장이 진행 중 저장과 겹쳐 늦게 끝난 옛 답이 새 답을 덮지 않게.
    scope: { id: `application-draft-${recruitmentId}` },
    // 자동저장은 입력이 멈출 때마다 반복 발화한다. 여기서 invalidate 하면 지원서 화면에 떠 있는
    // 조회 훅이 곧바로 재조회해, 방금 올려보낸 답변 전문이 GET 응답으로 그대로 되돌아온다(순수 낭비).
    // PUT 은 204(본문 없음)라 서버 에코가 없지만, 저장에 성공한 payload 자체가 곧 서버 상태이므로
    // 그 값으로 캐시를 직접 맞추고 재조회는 하지 않는다. 저장 시각은 화면의 "마지막 저장" 표기와
    // 같은 기준(클라이언트 시계)으로 채운다.
    // 캐시가 있을 때만 맞춘다 — 화면을 떠난 뒤 끝난 저장이 기본 gcTime 5분 쿼리를 새로 만들면 gcTime 0 이 무력해진다.
    // 폼은 마운트 때만 읽지만 맞춰 둔다 — 자격 차단이 풀려 폼이 다시 마운트되면 이 값으로 채운다.
    onSuccess: (_noContent, savedPayload) => {
      queryClient.setQueryData<ApplicationDraft>(
        draftQueryKeys.byRecruitment(recruitmentId),
        (cached) =>
          cached === undefined
            ? undefined
            : {
                exists: true,
                answers: savedPayload.answers,
                updatedAt: new Date().toISOString(),
              },
      );
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
