import { describe, expect, it } from 'vitest';
import type { AdminClubSummary } from '@duing/types';

import {
  pendingCleanupCounts,
  pendingCleanupDialogLines,
  pendingCleanupResultMessage,
  pendingCleanupRowText,
} from '@/app/admin/clubs/_lib/pendingCleanup';

const club = (overrides: Partial<AdminClubSummary>): AdminClubSummary => ({
  id: 9, name: '쉬는 동아리', category: 'ACADEMIC', division: null, college: null, logoUrl: null,
  status: 'INACTIVE', tags: [], leaderId: null, leaderName: null, leaderStudentId: null,
  centralClub: false, facilitySecuredTimeTarget: false, rejectionReason: null,
  statusChangedAt: '2026-10-27T03:00:00Z', statusChangedByName: '총동연관리자', ...overrides,
});

describe('pendingCleanupCounts — 건수·정리 버튼을 둘 동아리', () => {
  it('운영 중단이고 두 건수가 숫자이며 합이 1 이상이면 건수를 준다', () => {
    expect(pendingCleanupCounts(club({ undecidedApplicationCount: 3, pendingJoinRequestCount: 1 }))).toEqual({ applications: 3, joinRequests: 1 });
    expect(pendingCleanupCounts(club({ undecidedApplicationCount: 0, pendingJoinRequestCount: 2 }))).toEqual({ applications: 0, joinRequests: 2 });
  });

  it.each<[string, Partial<AdminClubSummary>]>([
    ['둘 다 0', { undecidedApplicationCount: 0, pendingJoinRequestCount: 0 }],
    ['필드 없음(옛 백엔드)', {}],
    ['한쪽만 있음', { undecidedApplicationCount: 2 }],
    ['null', { undecidedApplicationCount: null, pendingJoinRequestCount: null }],
    ['운영 중', { status: 'ACTIVE', undecidedApplicationCount: 3, pendingJoinRequestCount: 1 }],
  ])('%s 이면 null', (_label, overrides) => {
    expect(pendingCleanupCounts(club(overrides))).toBeNull();
  });
});

describe('문구 — 0건인 쪽은 뺀다', () => {
  it.each([
    [{ applications: 3, joinRequests: 1 }, '남은 지원서 3 · 가입 신청 1'],
    [{ applications: 0, joinRequests: 2 }, '남은 가입 신청 2'],
    [{ applications: 2, joinRequests: 0 }, '남은 지원서 2'],
  ])('표 줄 %o → %s', (counts, expected) => {
    expect(pendingCleanupRowText(counts)).toBe(expected);
  });

  it('확인 창 본문은 스펙 문구 4줄이고, 0건인 쪽 줄은 뺀다', () => {
    expect(pendingCleanupDialogLines({ applications: 3, joinRequests: 1 })).toEqual([
      "지원서 3건은 불합격으로 바뀌어요. 지원자에게는 '동아리 운영 중단으로 선발이 끝났어요'로 보여요.",
      '가입 신청 1건은 거절돼요.',
      '알림은 보내지 않아요.',
      '되돌릴 수 없어요.',
    ]);
    expect(pendingCleanupDialogLines({ applications: 0, joinRequests: 1 })).toEqual([
      '가입 신청 1건은 거절돼요.', '알림은 보내지 않아요.', '되돌릴 수 없어요.',
    ]);
    expect(pendingCleanupDialogLines({ applications: 2, joinRequests: 0 })).toHaveLength(3);
  });

  it.each([
    [{ rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 }, '지원서 3건·가입 신청 1건을 정리했어요'],
    [{ rejectedApplicationCount: 3, rejectedJoinRequestCount: 0 }, '지원서 3건을 정리했어요'],
    [{ rejectedApplicationCount: 0, rejectedJoinRequestCount: 1 }, '가입 신청 1건을 정리했어요'],
    [{ rejectedApplicationCount: 0, rejectedJoinRequestCount: 0 }, '정리할 미결이 없었어요'],
  ])('토스트 %o → %s', (cleanupResult, expected) => {
    expect(pendingCleanupResultMessage(cleanupResult)).toBe(expected);
  });
});
