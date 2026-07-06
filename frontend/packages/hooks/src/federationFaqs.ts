import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFederationFaqCategoryPayload,
  CreateFederationFaqPayload,
  FederationFaqFeedbackPayload,
  UpdateFederationFaqCategoryPayload,
  UpdateFederationFaqPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { federationFaqQueryKeys } from './federationFaqQueryKeys';

type ListParams = {
  categoryId?: number;
  keyword?: string;
  page: number;
  size: number;
};

export function useFederationFaqListQuery(params: ListParams, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationFaqQueryKeys.list(params),
    queryFn: () => client.federationFaqs.list(params),
    enabled,
    staleTime: 30_000,
  });
}

export function useFederationFaqDetailQuery(faqId: number | null, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationFaqQueryKeys.detail(faqId ?? -1),
    queryFn: () => {
      if (faqId === null) throw new Error('faqId is null but query is enabled');
      return client.federationFaqs.detail(faqId);
    },
    enabled: enabled && faqId !== null,
    staleTime: 30_000,
  });
}

// 공개 표면(학생 화면)에는 카운트가 없어 무효화할 캐시가 없다 — admin 목록은 다음 조회 시
// 자연스럽게 최신 집계를 받는다(별도 invalidate 불필요).
export function useSubmitFaqFeedbackMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ faqId, payload }: { faqId: number; payload: FederationFaqFeedbackPayload }) =>
      client.federationFaqs.submitFeedback(faqId, payload),
  });
}

export function useFederationFaqCategoriesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: federationFaqQueryKeys.categories,
    queryFn: () => client.federationFaqCategories.list(),
    staleTime: 300_000,
  });
}

type AdminListParams = {
  published?: boolean;
  categoryId?: number;
  keyword?: string;
  page: number;
  size: number;
};

export function useAdminFederationFaqListQuery(params: AdminListParams, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationFaqQueryKeys.adminList(params),
    queryFn: () => client.admin.federationFaqs.list(params),
    enabled,
    staleTime: 15_000,
  });
}

type AdminSearchMissListParams = { page: number; size: number };

// 읽기 전용 admin 갭 신호(무결과 검색어 집계) — mutation 이 없어 캐시 무효화 대상이 없다.
export function useAdminFederationFaqSearchMissesQuery(params: AdminSearchMissListParams, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationFaqQueryKeys.adminSearchMisses(params),
    queryFn: () => client.admin.federationFaqs.searchMisses(params),
    enabled,
    staleTime: 15_000,
  });
}

export function useAdminFederationFaqCreateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFederationFaqPayload) => client.admin.federationFaqs.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: federationFaqQueryKeys.all });
    },
  });
}

export function useAdminFederationFaqUpdateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ faqId, payload }: { faqId: number; payload: UpdateFederationFaqPayload }) =>
      client.admin.federationFaqs.update(faqId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: federationFaqQueryKeys.all });
    },
  });
}

export function useAdminFederationFaqDeleteMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (faqId: number) => client.admin.federationFaqs.remove(faqId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: federationFaqQueryKeys.all });
    },
  });
}

export function useAdminFederationFaqReorderMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: number[]) => client.admin.federationFaqs.reorder(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: federationFaqQueryKeys.all });
    },
  });
}

export function useAdminFederationFaqCategoryCreateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFederationFaqCategoryPayload) =>
      client.admin.federationFaqCategories.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: federationFaqQueryKeys.all });
    },
  });
}

export function useAdminFederationFaqCategoryUpdateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      payload,
    }: {
      categoryId: number;
      payload: UpdateFederationFaqCategoryPayload;
    }) => client.admin.federationFaqCategories.update(categoryId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: federationFaqQueryKeys.all });
    },
  });
}
