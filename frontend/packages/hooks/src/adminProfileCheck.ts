import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
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
 * 화면을 그린 뒤 학기가 바뀌어 서버가 켜는 저장을 거절했다(409 PROFILE_CHECK_SEMESTER_CHANGED). 처음 불러온 노출 여부(켜짐)를 그대로
 * 보내면 아무도 다시 켜지 않았는데 새 학기 팝업이 시작되기 때문이다(스펙 D7). 훅이 최신 설정을 다시 받아 화면은 새 학기로 다시 그려진다.
 */
export class ProfileCheckSemesterChangedError extends Error {
  constructor() {
    super('profile check semester changed after the settings were rendered');
    this.name = 'ProfileCheckSemesterChangedError';
  }
}

export type UpdateAdminProfileCheckVariables = {
  payload: Omit<UpdateAdminProfileCheckPayload, 'currentSemesterYear' | 'currentSemesterTerm'>;
  /** 화면이 그려질 때의 오늘 학기 — 함께 보내면 서버가 켜는 저장에서 오늘 학기와 대조한다. */
  expectedSemester: Pick<AdminProfileCheck, 'currentSemesterYear' | 'currentSemesterTerm'>;
};

/**
 * 설정 저장(제목·문구·노출 여부). 화면이 본 학기를 함께 보내 서버가 대조한다 — 저장과 같은 순간의 판정이라 0시 틈이 없고 요청도
 * 하나다. 학기가 바뀌었으면 최신 설정을 다시 받은 뒤 ProfileCheckSemesterChangedError. 성공하면 무효화 Promise 를 돌려줘 재조회가
 * 끝난 뒤에 끝난다 — 화면이 성공 콜백에서 입력 초안을 비울 때 옛 값이 한 번 비쳤다가 새 값으로 바뀌지 않게 한다.
 */
export function useUpdateAdminProfileCheckMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ payload, expectedSemester }: UpdateAdminProfileCheckVariables) => {
      try {
        await client.admin.profileCheck.update({ ...payload, ...expectedSemester });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'PROFILE_CHECK_SEMESTER_CHANGED') {
          // 최신 설정을 받아 화면을 새 학기로 다시 그린 뒤에 알린다(입력 초안은 화면이 지킨다).
          await queryClient.invalidateQueries({ queryKey: adminQueryKeys.profileCheck() });
          throw new ProfileCheckSemesterChangedError();
        }
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.profileCheck() }),
  });
}
