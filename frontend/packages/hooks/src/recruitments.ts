import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRecruitmentPayload, UpdateRecruitmentPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
import { recruitmentQueryKeys } from './recruitmentQueryKeys';

export function useCreateRecruitmentMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRecruitmentPayload) =>
      client.recruitments.create(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.recruitments(clubId) });
    },
  });
}

export function useRecruitmentCalendarQuery(yearMonth: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: recruitmentQueryKeys.calendar(yearMonth),
    queryFn: () => client.recruitments.calendar(yearMonth),
  });
}

export function useRecruitmentDetailQuery(recruitmentId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      recruitmentId !== undefined
        ? recruitmentQueryKeys.detail(recruitmentId)
        : ['recruitments', undefined],
    queryFn: () => {
      if (recruitmentId === undefined) {
        throw new Error('recruitmentId is required');
      }
      return client.recruitments.detail(recruitmentId);
    },
    enabled: recruitmentId !== undefined,
  });
}

export function useUpdateRecruitmentMutation(recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateRecruitmentPayload) =>
      client.recruitments.update(recruitmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.detail(recruitmentId) });
    },
  });
}

export function useCloseRecruitmentMutation(recruitmentId: number, clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.recruitments.close(recruitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.detail(recruitmentId) });
      // 마감은 가입 링크 응답도 바꾼다 — 종료 시각이 생기면서 joinExpiresAt 이 null 에서 실제
      // 만료 일시로 채워진다(스펙 §4.3). 무효화하지 않으면 상태 카드가 "모집 종료 후 N일까지"에
      // 멈춰 새로고침 전까지 구체 일시를 보여주지 못한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.joinCode(clubId, recruitmentId) });
    },
  });
}

export function useDeleteRecruitmentMutation(clubId: number, recruitmentId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.recruitments.remove(recruitmentId),
    onSuccess: () => {
      // 동아리 모집 목록을 갱신하고, 삭제된 상세 캐시도 무효화해 뒤로가기 시 구 데이터가 남지 않게 한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.recruitments(clubId) });
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.detail(recruitmentId) });
    },
  });
}