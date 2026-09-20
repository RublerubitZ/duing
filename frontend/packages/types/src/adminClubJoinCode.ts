// 총동연 가입 링크 목록·강제 폐기 — BE domain/joincode 의 관리자 응답 계약과 1:1.
import type { IsoInstantString } from './datetime';
import type { JoinCodeLinkType } from './joinCode';

/**
 * 링크 행에서 파생하는 상태(컬럼 아님). 서버가 `REVOKED > EXHAUSTED > EXPIRED > ACTIVE` 우선순위로
 * 한 번 판정해 내려보내므로 화면은 그대로 적는다 — 만료 계산을 프론트에서 다시 하지 않는다.
 */
export type AdminJoinCodeStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED';

/**
 * 총동연 가입 링크 목록 행. 운영진 화면(`JoinCodeSummary`)과 달리 폐기·만료·소진된 링크까지 전부 실린다 —
 * 총동연이 보는 것은 "지금 쓸 수 있는 링크"가 아니라 그 동아리가 만든 링크의 이력이기 때문이다.
 *
 * `joinExpiresAt` 이 사용 기한 단일 출처다: 초대 링크는 `inviteExpiresAt` 과 같은 값이 실리고,
 * 모집 링크는 모집이 진행 중이면 기한이 아직 정해지지 않아 null 이다.
 */
export type AdminClubJoinCode = {
  joinCodeId: number;
  linkType: JoinCodeLinkType;
  code: string;
  /** 부원 초대 링크면 null. */
  recruitmentId: number | null;
  /** 모집이 지워졌으면 null — 모집 링크라도 제목을 가정하지 않는다. */
  recruitmentTitle: string | null;
  generation: number | null;
  maxUses: number;
  usedCount: number;
  totalRequestCount: number;
  pendingCount: number;
  autoApprove: boolean;
  joinWindowDays: number;
  joinExpiresAt: IsoInstantString | null;
  inviteExpiresAt: IsoInstantString | null;
  status: AdminJoinCodeStatus;
  createdAt: IsoInstantString;
  createdById: number;
  /** 발급자가 탈퇴하면 이름만 비고 id 는 남는다. */
  createdByName: string | null;
  revokedAt: IsoInstantString | null;
  revokedById: number | null;
  revokedByName: string | null;
};

/** 사유는 필수다(공백 불가·500자) — 왜 끊었는지 설명 없는 행이 이력에 남으면 의미가 없다. */
export type ForceRevokeJoinCodePayload = {
  reason: string;
};
