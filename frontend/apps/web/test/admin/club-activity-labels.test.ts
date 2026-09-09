import { describe, expect, it } from 'vitest';
import type { AdminClubActivityEvent } from '@duing/types';
import {
  activityActorLabel,
  activityDetailSummary,
  activityEventLabel,
} from '@/app/admin/clubs/[clubId]/activity-log/_lib/activityLabels';

function eventOf(overrides: Partial<AdminClubActivityEvent>): AdminClubActivityEvent {
  return {
    eventId: 1,
    eventType: 'CLUB_CLOSED',
    actorUserId: 3,
    actorName: '총동연',
    createdAt: '2026-09-08T03:00:00Z',
    reason: null,
    recruitmentId: null,
    joinCodeId: null,
    detail: null,
    ...overrides,
  };
}

describe('activityEventLabel', () => {
  it('상태 변경은 from→to 를 한글 상태명으로 표기한다', () => {
    expect(
      activityEventLabel(
        eventOf({ eventType: 'CLUB_STATUS_CHANGED', detail: { from: 'PENDING_APPROVAL', to: 'REJECTED' } }),
      ),
    ).toBe('상태 변경 · 승인 대기 → 거절');
  });
  it('상태 detail 이 없거나 모르는 값이면 "알 수 없음" 으로 방어한다', () => {
    expect(activityEventLabel(eventOf({ eventType: 'CLUB_STATUS_CHANGED', detail: null }))).toBe(
      '상태 변경 · 알 수 없음 → 알 수 없음',
    );
  });
  it('폐쇄는 "동아리 폐쇄"', () => {
    expect(activityEventLabel(eventOf({ eventType: 'CLUB_CLOSED' }))).toBe('동아리 폐쇄');
  });
  it('가입 링크 이벤트는 recruitmentId 유무로 부원 초대/모집 가입 링크를 가른다', () => {
    expect(activityEventLabel(eventOf({ eventType: 'JOIN_LINK_CREATED', recruitmentId: null }))).toBe(
      '부원 초대 링크 발급',
    );
    expect(activityEventLabel(eventOf({ eventType: 'JOIN_LINK_REGENERATED', recruitmentId: 5 }))).toBe(
      '모집 가입 링크 재발급',
    );
    expect(activityEventLabel(eventOf({ eventType: 'JOIN_LINK_REVOKED', recruitmentId: 5 }))).toBe(
      '모집 가입 링크 폐기',
    );
  });
});

describe('activityDetailSummary', () => {
  it('자동승인 초대 발급은 자동승인·정원·KST 만료를 요약한다', () => {
    expect(
      activityDetailSummary(
        eventOf({
          eventType: 'JOIN_LINK_CREATED',
          detail: { linkType: 'CLUB_INVITE', autoApprove: true, maxUses: 30, expiresAt: '2026-09-11T05:00:00Z' },
        }),
      ),
    ).toBe('자동승인 · 정원 30 · 만료 2026.09.11 14:00');
  });
  it('승인제 초대는 "승인제" 로 표기한다', () => {
    expect(
      activityDetailSummary(
        eventOf({ eventType: 'JOIN_LINK_REGENERATED', detail: { autoApprove: false, maxUses: 10 } }),
      ),
    ).toBe('승인제 · 정원 10');
  });
  it('detail 이 없거나 링크 발급이 아니면 빈 문자열', () => {
    expect(activityDetailSummary(eventOf({ eventType: 'JOIN_LINK_CREATED', detail: null }))).toBe('');
    expect(activityDetailSummary(eventOf({ eventType: 'JOIN_LINK_REVOKED', detail: { autoApprove: true } }))).toBe('');
    expect(activityDetailSummary(eventOf({ eventType: 'CLUB_STATUS_CHANGED', detail: { from: 'ACTIVE' } }))).toBe('');
  });
});

describe('activityActorLabel', () => {
  it('이름이 있으면 이름, 없으면 "탈퇴한 회원"', () => {
    expect(activityActorLabel(eventOf({ actorName: '이운영' }))).toBe('이운영');
    expect(activityActorLabel(eventOf({ actorName: null }))).toBe('탈퇴한 회원');
  });
});
