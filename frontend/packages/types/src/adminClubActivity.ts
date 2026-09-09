/**
 * 관리자 동아리 활동 이력(AdminClubActivityEventResponse 미러).
 * 서버 허용 6종만 실린다 — 회비·가입 요청 종류는 이 API 로 오지 않는다.
 */
export const ADMIN_CLUB_ACTIVITY_EVENT_TYPES = [
  'CLUB_STATUS_CHANGED',
  'CLUB_CLOSED',
  'JOIN_LINK_CREATED',
  'JOIN_LINK_REGENERATED',
  'JOIN_LINK_REVOKED',
  'JOIN_LINK_FORCE_REVOKED',
] as const;

export type AdminClubActivityEventType = (typeof ADMIN_CLUB_ACTIVITY_EVENT_TYPES)[number];

/**
 * detail 은 이벤트 종류마다 키가 다른 스냅샷 원문이다 — 상태 전이는 {from,to}, 부원 초대 발급은
 * {linkType,autoApprove,maxUses,expiresAt}. 계측 전 행·폐기·모집 링크는 null 이므로 키를 가정하지 말고 있는 것만 읽는다.
 * recruitmentId 가 null 인 가입 링크 이벤트가 부원 초대 링크다.
 */
export type AdminClubActivityEvent = {
  eventId: number;
  eventType: AdminClubActivityEventType;
  actorUserId: number;
  /** 탈퇴 회원이면 null. */
  actorName: string | null;
  createdAt: string;
  reason: string | null;
  recruitmentId: number | null;
  joinCodeId: number | null;
  detail: Record<string, unknown> | null;
};

export type AdminClubActivityEventsParams = {
  /** 복수 지정 가능. 생략하면 허용 6종 전체. */
  types?: AdminClubActivityEventType[];
  page?: number;
  size?: number;
};
