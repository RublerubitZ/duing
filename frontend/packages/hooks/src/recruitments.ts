import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRecruitmentPayload, UpdateRecruitmentPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
import { CALENDAR_STALE_TIME_MS } from './freshness';
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
    // 캘린더 축 계층(freshness.ts) — calendarMonth 의 같은 키 관측자와 값을 공유해야 한다.
    staleTime: CALENDAR_STALE_TIME_MS,
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
    // 모집 축 계층(freshness.ts) — 마감·수정은 detail 무효화가 즉시 반영, 지원은 eligibility 가 최종 게이트.
    staleTime: CALENDAR_STALE_TIME_MS,
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
      // 마감은 공개 클럽 모집 목록의 상태 칩·대표 모집 표시도 바꾼다 — stopIntake·delete 와 동일하게
      // 목록을 무효화한다. staleTime 계층화(freshness.ts) 후에는 이 무효화가 없으면 마감 직후 본인
      // 공개 페이지에 '모집중'이 최대 2분 남는다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.recruitments(clubId) });
      // 마감은 가입 링크 응답도 바꾼다 — 종료 시각이 생기면서 joinExpiresAt 이 null 에서 실제
      // 만료 일시로 채워진다(스펙 §4.3). 무효화하지 않으면 상태 카드가 "모집 종료 후 N일까지"에
      // 멈춰 새로고침 전까지 구체 일시를 보여주지 못한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.joinCode(clubId, recruitmentId) });
    },
  });
}

export function useStopRecruitmentIntakeMutation(recruitmentId: number, clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.recruitments.stopIntake(recruitmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.detail(recruitmentId) });
      // 접수 마감은 endDate 를 확정해 목록 카드의 기간 라벨·상태 칩·D-day 를 바꾼다 — 목록도 함께 갱신한다.
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.recruitments(clubId) });
      // effectivelyOpen 이 닫히면서 가입 링크 신규 발급 게이트도 바뀐다.
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