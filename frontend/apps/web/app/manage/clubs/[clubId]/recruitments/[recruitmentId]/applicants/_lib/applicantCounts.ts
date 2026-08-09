import type { Applicant, ApplicationStatus } from '@duing/types';

export type StatusCounts = Record<ApplicationStatus, number> & { total: number };

const EMPTY_COUNTS: StatusCounts = {
  total: 0,
  SUBMITTED: 0,
  ON_HOLD: 0,
  INTERVIEW_PENDING: 0,
  ACCEPTED: 0,
  REJECTED: 0,
};

/**
 * 상태별 인원을 목록에서 직접 센다. stats/summary 는 필터를 받지 않아 단과대·기간·검색어가 걸리면
 * 칩 숫자와 눈앞 목록이 어긋난다 — 칩이 "현황 + 필터" 이려면 둘이 같아야 한다.
 * 그래서 목록은 status 없이 받아오고(다른 필터는 서버가 적용), 여기서 세고, 상태 필터는 클라이언트에서 건다.
 */
export function countByStatus(applicants: Applicant[]): StatusCounts {
  return applicants.reduce<StatusCounts>(
    (counts, applicant) => ({
      ...counts,
      total: counts.total + 1,
      // BE 가 새 상태를 추가해도 NaN 이 칩에 노출되지 않게 한다(FE fail-open 관례).
      [applicant.status]: (counts[applicant.status] ?? 0) + 1,
    }),
    { ...EMPTY_COUNTS },
  );
}
