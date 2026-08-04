import type { ApplicationSummary } from '@duing/types';

import {
  isRecruitmentClosed,
  isTerminalApplicationStatus,
} from '@/app/_constants/application-status';

export type PartitionedApplications = {
  /** 아직 결과를 기다리는 지원 — 모집이 열려 있고 합격·불합격도 아직이다. */
  inProgress: ApplicationSummary[];
  /** 결과가 나왔거나 모집이 끝난 지원. */
  archived: ApplicationSummary[];
};

/**
 * 내 지원을 진행 중 / 지난 지원으로 나눈다.
 *
 * 서버 scope 는 지원 상태만 보므로 마감된 모집의 미결 지원이 진행 중으로 남는다. 그렇다고 서버
 * 한쪽 scope 만 좁히면 어느 응답에도 안 담기는 지원이 생기므로(카운트만 세고 행은 안 그려지는
 * 유령 항목), 전체를 한 번 받아 여기서 나눈다. 두 배열은 항상 원본의 완전 분할이어야 한다.
 */
export function partitionApplications(
  applications: ApplicationSummary[],
): PartitionedApplications {
  const inProgress: ApplicationSummary[] = [];
  const archived: ApplicationSummary[] = [];

  for (const application of applications) {
    const isFinished =
      isTerminalApplicationStatus(application.status) ||
      isRecruitmentClosed(application.recruitmentStatus);
    (isFinished ? archived : inProgress).push(application);
  }

  return { inProgress, archived };
}
