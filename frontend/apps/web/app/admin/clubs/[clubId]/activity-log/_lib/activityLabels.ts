import type { AdminClubActivityEvent, ClubStatus } from '@duing/types';
import { formatDateTimeKst } from '@duing/hooks/datetime';

import { STATUS_LABEL } from '../../../_lib/clubStatus';

const CLUB_STATUSES: ReadonlyArray<ClubStatus> = ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED'];

function isClubStatus(value: unknown): value is ClubStatus {
  return typeof value === 'string' && CLUB_STATUSES.some((status) => status === value);
}

/** detail 은 서버가 형태를 규정하지 않는 원문이라 모르는 값은 그대로 보이지 않고 방어 문구로 바꾼다. */
function statusLabelOf(value: unknown): string {
  return isClubStatus(value) ? STATUS_LABEL[value] : '알 수 없음';
}

/** 가입 링크와 부원 초대는 같은 이벤트다 — 모집 귀속(recruitmentId) 유무로만 갈린다. */
function linkKindLabel(event: AdminClubActivityEvent): string {
  return event.recruitmentId === null ? '부원 초대 링크' : '모집 가입 링크';
}

export function activityEventLabel(event: AdminClubActivityEvent): string {
  switch (event.eventType) {
    case 'CLUB_STATUS_CHANGED':
      return `상태 변경 · ${statusLabelOf(event.detail?.from)} → ${statusLabelOf(event.detail?.to)}`;
    case 'CLUB_CLOSED':
      return '동아리 폐쇄';
    case 'JOIN_LINK_CREATED':
      return `${linkKindLabel(event)} 발급`;
    case 'JOIN_LINK_REGENERATED':
      return `${linkKindLabel(event)} 재발급`;
    case 'JOIN_LINK_REVOKED':
      return `${linkKindLabel(event)} 폐기`;
  }
}

/**
 * 부원 초대 발급 detail 요약("자동승인 · 정원 30 · 만료 2026.09.11 14:00").
 * detail 이 없으면(계측 전 행·폐기·모집 링크) 빈 문자열 — 호출 측이 줄 자체를 그리지 않는다.
 */
export function activityDetailSummary(event: AdminClubActivityEvent): string {
  if (event.eventType !== 'JOIN_LINK_CREATED' && event.eventType !== 'JOIN_LINK_REGENERATED') return '';
  const detail = event.detail;
  if (detail === null) return '';
  const parts: string[] = [];
  if (typeof detail.autoApprove === 'boolean') parts.push(detail.autoApprove ? '자동승인' : '승인제');
  if (typeof detail.maxUses === 'number') parts.push(`정원 ${detail.maxUses}`);
  if (typeof detail.expiresAt === 'string') parts.push(`만료 ${formatDateTimeKst(detail.expiresAt)}`);
  return parts.join(' · ');
}

/** 행위자는 운영진·총동연이다. 탈퇴하면 이름만 비고 id 는 남는다. */
export function activityActorLabel(event: AdminClubActivityEvent): string {
  return event.actorName ?? '탈퇴한 회원';
}
