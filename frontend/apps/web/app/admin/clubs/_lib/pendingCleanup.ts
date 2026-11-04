import type { AdminClubPendingCleanupResult, AdminClubSummary } from '@duing/types';
import { APPLICATION_ENDED_BY_CLUB_DEACTIVATION_DESCRIPTION } from '@/app/_constants/application-status';

/** 운영 중단 동아리의 남은 미결 건수. */
export type PendingCleanupCounts = { applications: number; joinRequests: number };

/**
 * 표에 건수·정리 버튼을 둘 동아리인지 — 운영 중단이고 두 건수가 모두 숫자이며 합이 1 이상일 때만.
 * 건수 필드가 없으면 옛 백엔드라 그리지 않는다(스펙 §5-1 끝).
 */
export const pendingCleanupCounts = (club: AdminClubSummary): PendingCleanupCounts | null => {
  const applications = club.undecidedApplicationCount;
  const joinRequests = club.pendingJoinRequestCount;
  if (club.status !== 'INACTIVE' || typeof applications !== 'number' || typeof joinRequests !== 'number') return null;
  return applications + joinRequests > 0 ? { applications, joinRequests } : null;
};

// 0건인 쪽은 뺀다 — 표·확인 창·토스트가 같은 규칙이다.
const countParts = (applications: number, joinRequests: number, unit: string): string[] =>
  [
    applications > 0 ? `지원서 ${applications}${unit}` : null,
    joinRequests > 0 ? `가입 신청 ${joinRequests}${unit}` : null,
  ].filter((part) => part !== null);

/** 표 상태 배지 아래 줄 — "남은 지원서 3 · 가입 신청 1". */
export const pendingCleanupRowText = (counts: PendingCleanupCounts): string =>
  `남은 ${countParts(counts.applications, counts.joinRequests, '').join(' · ')}`;

/** 확인 창 본문. 건수는 목록을 받은 시점 값이라 실제 처리 건수는 토스트가 알린다. */
export const pendingCleanupDialogLines = (counts: PendingCleanupCounts): string[] =>
  [
    counts.applications > 0
      ? `지원서 ${counts.applications}건은 불합격으로 바뀌어요. 지원자에게는 '${APPLICATION_ENDED_BY_CLUB_DEACTIVATION_DESCRIPTION}'로 보여요.`
      : null,
    counts.joinRequests > 0 ? `가입 신청 ${counts.joinRequests}건은 거절돼요.` : null,
    '알림은 보내지 않아요.',
    '되돌릴 수 없어요.',
  ].filter((line) => line !== null);

/** 정리 결과 토스트 — 응답 건수 기준. 둘 다 0 이면 그사이 다른 담당자가 정리했거나 남은 것이 없었다. */
export const pendingCleanupResultMessage = (cleanupResult: AdminClubPendingCleanupResult): string => {
  const parts = countParts(cleanupResult.rejectedApplicationCount, cleanupResult.rejectedJoinRequestCount, '건');
  return parts.length > 0 ? `${parts.join('·')}을 정리했어요` : '정리할 미결이 없었어요';
};
