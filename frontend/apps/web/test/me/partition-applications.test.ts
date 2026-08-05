import { describe, it, expect } from 'vitest';
import { APPLICATION_STATUSES } from '@duing/types';
import type { ApplicationStatus, ApplicationSummary, RecruitmentStatus } from '@duing/types';

import { partitionApplications } from '@/app/me/_lib/partitionApplications';

// 마이페이지는 진행 중 / 지난 지원 두 배열만 그린다. 어느 쪽에도 안 담기는 지원이 생기면
// 카운트만 오르고 행은 렌더되지 않는 유령 항목이 되므로, "완전 분할"을 불변식으로 고정한다.

// 상태 목록은 타입 패키지의 SoT 를 그대로 쓴다 — 새 상태가 생기면 조합이 자동으로 늘어난다.
const ALL_STATUSES: readonly ApplicationStatus[] = APPLICATION_STATUSES;
const ALL_RECRUITMENT_STATUSES: RecruitmentStatus[] = ['OPEN', 'CLOSED'];

function make(
  id: number,
  status: ApplicationStatus,
  recruitmentStatus: RecruitmentStatus,
): ApplicationSummary {
  return {
    id,
    recruitmentId: id * 10,
    recruitmentTitle: '봄 신입 모집',
    recruitmentStatus,
    clubId: 1,
    clubName: '두잉 댄스',
    category: 'CREATION',
    logoUrl: null,
    status,
    interview: null,
    submittedAt: '2026-05-26T10:00:00Z',
  };
}

/** 지원 상태 × 모집 상태 전 조합. */
const everyCombination = ALL_STATUSES.flatMap((status, statusIndex) =>
  ALL_RECRUITMENT_STATUSES.map((recruitmentStatus, recruitmentIndex) =>
    make(statusIndex * 10 + recruitmentIndex + 1, status, recruitmentStatus),
  ),
);

describe('partitionApplications', () => {
  it('모든 조합에서 두 배열의 합집합은 입력 전체와 같다 — 어디에도 안 담기는 지원이 없다', () => {
    const { inProgress, archived } = partitionApplications(everyCombination);

    const partitionedIds = [...inProgress, ...archived].map((item) => item.id).sort((a, b) => a - b);
    expect(partitionedIds).toEqual(everyCombination.map((item) => item.id).sort((a, b) => a - b));
  });

  it('두 배열은 서로 겹치지 않는다', () => {
    const { inProgress, archived } = partitionApplications(everyCombination);

    const archivedIds = new Set(archived.map((item) => item.id));
    expect(inProgress.filter((item) => archivedIds.has(item.id))).toEqual([]);
  });

  it('모집이 마감된 미결 지원은 지난 지원으로 내려간다', () => {
    const closedUndecided = make(1, 'SUBMITTED', 'CLOSED');

    const { inProgress, archived } = partitionApplications([closedUndecided]);

    expect(inProgress).toEqual([]);
    expect(archived).toEqual([closedUndecided]);
  });

  it('모집이 열려 있는 미결 지원은 진행 중에 남는다', () => {
    const openUndecided = make(1, 'INTERVIEW_PENDING', 'OPEN');

    const { inProgress, archived } = partitionApplications([openUndecided]);

    expect(inProgress).toEqual([openUndecided]);
    expect(archived).toEqual([]);
  });

  it('결과가 나온 지원은 모집이 열려 있어도 지난 지원이다', () => {
    const acceptedWhileOpen = make(1, 'ACCEPTED', 'OPEN');

    const { archived } = partitionApplications([acceptedWhileOpen]);

    expect(archived).toEqual([acceptedWhileOpen]);
  });

  it('모집 상태를 아직 안 내려주는 응답은 진행 중으로 둔다 — 배포 전환기 fail-open', () => {
    const withoutRecruitmentStatus: ApplicationSummary = {
      ...make(1, 'SUBMITTED', 'OPEN'),
      recruitmentStatus: undefined,
    };

    const { inProgress } = partitionApplications([withoutRecruitmentStatus]);

    expect(inProgress).toHaveLength(1);
  });
});
