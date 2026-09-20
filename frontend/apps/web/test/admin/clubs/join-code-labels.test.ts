import { describe, expect, it } from 'vitest';

import type { AdminClubJoinCode } from '@duing/types';

import {
  JOIN_CODE_STATUS_LABEL,
  joinCodeAutoApproveLabel,
  joinCodeDateTimeLabel,
  joinCodeKindLabel,
} from '@/app/admin/clubs/[clubId]/join-codes/_lib/joinCodeLabels';

function joinCodeOf(overrides: Partial<AdminClubJoinCode> = {}): AdminClubJoinCode {
  return {
    joinCodeId: 1,
    linkType: 'CLUB_INVITE',
    code: 'ABC123',
    recruitmentId: null,
    recruitmentTitle: null,
    generation: null,
    maxUses: 30,
    usedCount: 4,
    totalRequestCount: 5,
    pendingCount: 1,
    autoApprove: false,
    joinWindowDays: 0,
    joinExpiresAt: null,
    inviteExpiresAt: null,
    status: 'ACTIVE',
    createdAt: '2026-09-08T03:00:00Z',
    createdById: 7,
    createdByName: '운영진',
    revokedAt: null,
    revokedById: null,
    revokedByName: null,
    ...overrides,
  };
}

describe('JOIN_CODE_STATUS_LABEL', () => {
  it('네 가지 상태를 한글 표기로 옮긴다', () => {
    expect(JOIN_CODE_STATUS_LABEL.ACTIVE).toBe('활성');
    expect(JOIN_CODE_STATUS_LABEL.EXPIRED).toBe('만료');
    expect(JOIN_CODE_STATUS_LABEL.EXHAUSTED).toBe('소진');
    expect(JOIN_CODE_STATUS_LABEL.REVOKED).toBe('폐기');
  });
});

describe('joinCodeKindLabel', () => {
  it('부원 초대 링크는 모집 제목 없이 종류만 적는다', () => {
    expect(joinCodeKindLabel(joinCodeOf())).toBe('부원 초대');
  });

  it('모집 가입 링크는 어느 모집 것인지 제목까지 적는다', () => {
    expect(
      joinCodeKindLabel(
        joinCodeOf({ linkType: 'RECRUITMENT', recruitmentId: 5, recruitmentTitle: '2026 신입 모집' }),
      ),
    ).toBe('모집 가입 · 2026 신입 모집');
  });

  it('모집이 지워졌으면 제목 자리를 비우지 않고 삭제 사실을 적는다', () => {
    expect(
      joinCodeKindLabel(joinCodeOf({ linkType: 'RECRUITMENT', recruitmentId: 5, recruitmentTitle: null })),
    ).toBe('모집 가입 · 삭제된 모집');
  });
});

describe('joinCodeAutoApproveLabel', () => {
  it('초대 링크만 자동승인 여부를 가른다', () => {
    expect(joinCodeAutoApproveLabel(joinCodeOf({ autoApprove: true }))).toBe('자동승인');
    expect(joinCodeAutoApproveLabel(joinCodeOf({ autoApprove: false }))).toBe('승인제');
  });

  it('자동 승인 옵션이 없는 모집 링크는 빈 자리로 둔다', () => {
    expect(joinCodeAutoApproveLabel(joinCodeOf({ linkType: 'RECRUITMENT', autoApprove: false }))).toBe('-');
  });
});

describe('joinCodeDateTimeLabel', () => {
  it('기한이 정해지지 않은 링크는 "-" 로 둔다', () => {
    expect(joinCodeDateTimeLabel(null)).toBe('-');
  });

  it('절대시각은 KST 로 옮긴다', () => {
    expect(joinCodeDateTimeLabel('2026-09-08T03:00:00Z')).toContain('2026');
    expect(joinCodeDateTimeLabel('2026-09-08T03:00:00Z')).toContain('12:00');
  });
});
