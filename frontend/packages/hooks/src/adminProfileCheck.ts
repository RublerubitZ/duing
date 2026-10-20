import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminProfileCheck, UpdateAdminProfileCheckPayload } from '@duing/types';

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
 * 화면을 그린 뒤 학기가 바뀌어 저장하지 않았다. 처음 불러온 노출 여부(enabled:true)를 그대로 보내면 아무도 다시 켜지 않았는데
 * 서버가 새 학기로 팝업을 시작한다(스펙 D7 — 학기가 바뀌면 다시 켜야 시작). 확인용으로 받은 최신 설정이 캐시를 갱신해 화면은 새 학기로 다시 그려진다.
 */
export class ProfileCheckSemesterChangedError extends Error {
  constructor() {
    super('profile check semester changed after the settings were rendered');
    this.name = 'ProfileCheckSemesterChangedError';
  }
}

export type UpdateAdminProfileCheckVariables = {
  payload: UpdateAdminProfileCheckPayload;
  /** 화면이 그려질 때의 오늘 학기 — 켜는 저장이면 저장 직전 서버의 오늘 학기와 다를 때 저장하지 않는다. */
  expectedSemester: Pick<AdminProfileCheck, 'currentSemesterYear' | 'currentSemesterTerm'>;
};

/**
 * 설정 저장(제목·문구·노출 여부). 켜는 저장은 직전에 설정을 새로 받아 오늘 학기가 화면과 같을 때만 보낸다(다르면
 * ProfileCheckSemesterChangedError). 무효화 Promise 를 돌려줘 재조회가 끝난 뒤에 성공으로 끝난다 —
 * 화면이 성공 콜백에서 입력 초안을 비울 때 옛 값이 한 번 비쳤다가 새 값으로 바뀌지 않게 한다(통계도 같은 응답으로 갱신된다).
 */
export function useUpdateAdminProfileCheckMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ payload, expectedSemester }: UpdateAdminProfileCheckVariables) => {
      // 끄기는 학기를 기록하지 않아(서버가 학기 칸을 그대로 둔다) 확인하지 않는다 — 막으면 다시 불러온 화면이 서버 값과 같아져
      // 저장 버튼은 꺼진 채 "다시 저장" 안내만 남는다.
      if (payload.enabled) {
        const latest = await queryClient.fetchQuery({
          queryKey: adminQueryKeys.profileCheck(),
          queryFn: () => client.admin.profileCheck.get(),
          staleTime: 0,
          // 전역 재시도를 물려받으면 네트워크·5xx 에서 1초 뒤 한 번 더 받아 오류 안내가 늦어진다.
          retry: false,
        });
        if (
          latest.currentSemesterYear !== expectedSemester.currentSemesterYear ||
          latest.currentSemesterTerm !== expectedSemester.currentSemesterTerm
        ) {
          throw new ProfileCheckSemesterChangedError();
        }
      }
      await client.admin.profileCheck.update(payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.profileCheck() }),
  });
}
