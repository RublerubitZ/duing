import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type {
  AnswerFederationInquiryPayload,
  ChangeFederationInquiryStatusPayload,
  CreateFederationInquiryPayload,
  FederationInquiryStatus,
  UpdateFederationInquiryAnswerPayload,
  UpdateFederationInquiryPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { federationInquiryQueryKeys } from './federationInquiryQueryKeys';
import { isNonRetryableError } from './retry';

// 삭제(410)·존재 은닉(404)은 정상적인 "더 볼 수 없는 상태"이므로 재시도하지 않고
// 호출부가 ApiError(status 404/410)로 폴백 화면을 노출한다. fee.ts의 retryUnlessNotFound 확장.
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (isNonRetryableError(error)) {
    return false;
  }
  if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
    return false;
  }
  return failureCount < 2;
}

type MyListParams = { status?: FederationInquiryStatus; page: number; size: number };

export function useMyFederationInquiriesQuery(params: MyListParams, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationInquiryQueryKeys.my(params),
    queryFn: () => client.federationInquiries.listMine(params),
    enabled,
    staleTime: 30_000,
  });
}

export function useFederationInquiryDetailQuery(inquiryId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationInquiryQueryKeys.detail(inquiryId ?? -1),
    queryFn: () => {
      if (inquiryId === null) throw new Error('inquiryId is null but query is enabled');
      return client.federationInquiries.detail(inquiryId);
    },
    enabled: inquiryId !== null,
    retry: retryUnlessClientError,
  });
}

// 첨부 원본 바이트(Blob) 조회 — inquiryId·attachmentId 둘 다 확정된 뒤에만 활성화한다.
export function useFederationInquiryAttachmentQuery(inquiryId: number | null, attachmentId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationInquiryQueryKeys.attachment(inquiryId ?? -1, attachmentId ?? -1),
    queryFn: () => {
      if (inquiryId === null || attachmentId === null) {
        throw new Error('inquiryId or attachmentId is null but query is enabled');
      }
      return client.federationInquiries.downloadAttachment(inquiryId, attachmentId);
    },
    enabled: inquiryId !== null && attachmentId !== null,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessClientError,
  });
}

export function useCreateFederationInquiryMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFederationInquiryPayload) => client.federationInquiries.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.all });
    },
  });
}

export function useUpdateFederationInquiryMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      inquiryId,
      payload,
    }: {
      inquiryId: number;
      payload: UpdateFederationInquiryPayload;
    }) => client.federationInquiries.update(inquiryId, payload),
    onSuccess: (_, { inquiryId }) => {
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.detail(inquiryId) });
    },
  });
}

export function useDeleteFederationInquiryMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inquiryId: number) => client.federationInquiries.remove(inquiryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.all });
    },
  });
}

type AdminListParams = {
  status?: FederationInquiryStatus;
  keyword?: string;
  page: number;
  size: number;
};

export function useAdminFederationInquiryListQuery(params: AdminListParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationInquiryQueryKeys.adminList(params),
    queryFn: () => client.admin.federationInquiries.list(params),
    staleTime: 15_000,
  });
}

export function useAdminFederationInquiryDetailQuery(inquiryId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: federationInquiryQueryKeys.adminDetail(inquiryId ?? -1),
    queryFn: () => {
      if (inquiryId === null) throw new Error('inquiryId is null but query is enabled');
      return client.admin.federationInquiries.detail(inquiryId);
    },
    enabled: inquiryId !== null,
    retry: retryUnlessClientError,
  });
}

export function useChangeFederationInquiryStatusMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      inquiryId,
      payload,
    }: {
      inquiryId: number;
      payload: ChangeFederationInquiryStatusPayload;
    }) => client.admin.federationInquiries.changeStatus(inquiryId, payload),
    onSuccess: (_, { inquiryId }) => {
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.adminDetail(inquiryId) });
    },
  });
}

export function useAnswerFederationInquiryMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      inquiryId,
      payload,
    }: {
      inquiryId: number;
      payload: AnswerFederationInquiryPayload;
    }) => client.admin.federationInquiries.answer(inquiryId, payload),
    onSuccess: (_, { inquiryId }) => {
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.adminDetail(inquiryId) });
    },
  });
}

export function useUpdateFederationInquiryAnswerMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      inquiryId,
      payload,
    }: {
      inquiryId: number;
      payload: UpdateFederationInquiryAnswerPayload;
    }) => client.admin.federationInquiries.updateAnswer(inquiryId, payload),
    onSuccess: (_, { inquiryId }) => {
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.adminDetail(inquiryId) });
    },
  });
}
