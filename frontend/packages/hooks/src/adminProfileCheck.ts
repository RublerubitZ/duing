import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateAdminProfileCheckPayload } from '@duing/types';

import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';

/** 학기별 사용자 정보 확인 팝업의 설정과 확인 현황(총동연). */
export function useAdminProfileCheckQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.profileCheck(),
    queryFn: () => client.admin.profileCheck.get(),
  });
}

/**
 * 설정 저장(제목·문구·노출 여부). 무효화 Promise 를 돌려줘 재조회가 끝난 뒤에 성공으로 끝난다 —
 * 화면이 성공 콜백에서 입력 초안을 비울 때 옛 값이 한 번 비쳤다가 새 값으로 바뀌지 않게 한다(통계도 같은 응답으로 갱신된다).
 */
export function useUpdateAdminProfileCheckMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAdminProfileCheckPayload) =>
      client.admin.profileCheck.update(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.profileCheck() }),
  });
}
