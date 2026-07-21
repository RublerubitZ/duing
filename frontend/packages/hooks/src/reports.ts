import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminReportSearchParams, ProcessReportPayload, SubmitReportPayload } from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

export function useSubmitReportMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (payload: SubmitReportPayload) => client.reports.submit(payload),
  });
}

export function useAdminReportListQuery(params: AdminReportSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.reportsList(params),
    queryFn: () => client.admin.reports.list(params),
  });
}

export function useAdminReportDetailQuery(reportId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.reportsDetail(reportId ?? -1),
    queryFn: () => {
      if (reportId === null) throw new Error('reportId is null but query is enabled');
      return client.admin.reports.get(reportId);
    },
    enabled: reportId !== null,
  });
}

export function useProcessReportMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, payload }: { reportId: number; payload: ProcessReportPayload }) =>
      client.admin.reports.process(reportId, payload),
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.reportsAll });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.reportsDetail(reportId) });
      // 사이드바 뱃지 — 처리 즉시 숫자가 줄어야 한다.
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pendingCounts() });
    },
  });
}
