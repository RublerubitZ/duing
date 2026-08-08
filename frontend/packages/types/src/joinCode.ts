// 가입 링크(코드) / 가입 요청 — BE domain/joincode 응답 계약과 1:1.
// 내부 식별자·API 경로는 join-code 그대로이고, 사용자 대면 문구만 "가입 링크"로 통일했다.
import type { IsoInstantString } from './datetime';

/** 링크 종류. 모집에 귀속된 모집 링크와 모집과 무관한 동아리 단위 부원 초대 링크. */
export type JoinCodeLinkType = 'RECRUITMENT' | 'CLUB_INVITE';

/**
 * 운영 콘솔의 활성 가입 링크. 종류는 `linkType` 두 가지이고 스코프당 활성 링크가 1개인 건 같다 —
 * 모집 링크는 모집(recruitment)에 귀속돼 모집당 1개, 부원 초대 링크는 동아리당 1개다.
 *
 * ⚠️ 활성(active) 이 곧 사용 가능(usable)은 아니다 — 조회는 만료된 링크도 그대로 내려준다.
 * 만료 방식은 종류마다 다르다: 모집 링크는 절대 만료일이 없고(스펙 v2 §4.3) 가입 가능 기간이
 * 모집 종료 시각 기준 프리셋이라 모집이 진행 중이면 `joinExpiresAt` 이 null 이고 종료된 뒤에만
 * 실제 만료 시각이 생긴다. 부원 초대 링크는 발급 시각 기준 절대 만료(24/72시간)라 발급 순간부터
 * `inviteExpiresAt` 에 값이 있고 `joinExpiresAt` 에도 같은 값이 실린다 — 만료 표시는 한 필드만 봐도 된다.
 */
export type JoinCodeSummary = {
  joinCodeId: number;
  code: string;
  // 코드로 가입한 회원에게 찍힐 기수 스냅샷. 미지정이면 null.
  generation: number | null;
  maxUses: number;
  usedCount: number;
  // 모집 종료 기준 가입 가능 기간 프리셋(0=종료일까지 / 7 / 14).
  joinWindowDays: number;
  // 모집이 실제로 종료된 뒤에만 값이 생긴다 — 진행 중이면 null(만료 없음).
  joinExpiresAt: IsoInstantString | null;
  // 상태 카드(스펙 v2 §7.2) 수치 — 전 상태 누적 가입 신청 수와 승인 대기 수. 프론트 합산 금지.
  totalRequestCount: number;
  pendingCount: number;
  linkType: JoinCodeLinkType;
  // 초대 링크의 절대 만료 시각. 모집 링크는 항상 null.
  inviteExpiresAt: IsoInstantString | null;
  // true 면 가입 요청이 운영진 승인 없이 즉시 승인된다 — 초대 링크 옵션이라 모집 링크는 항상 false.
  autoApprove: boolean;
};

export type CreateJoinCodePayload = {
  // 1~150 — 그 외 값은 BE 400.
  maxUses: number;
  // 0/7/14 만 허용 — 그 외 값은 BE 400.
  joinWindowDays: number;
  generation?: number;
};

/** 부원 초대 링크 발급 설정. 모집 링크와 달리 가입 가능 기간이 아니라 절대 만료 시간을 고른다. */
export type CreateClubInviteCodePayload = {
  // 1~150 — 그 외 값은 BE 400.
  maxUses: number;
  // 24/72 만 허용 — 프리셋 밖 값은 BE 400 이라 타입 차원에서 봉쇄한다.
  expiresInHours: 24 | 72;
  autoApprove: boolean;
  generation?: number;
};

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * 학생의 코드 확인 화면(`/join/{code}`) 응답.
 *
 * ⚠️ `alreadyMember`·`myRequestStatus` 는 비로그인이면 둘 다 null 이다 — "이력 없음"이 아니라
 * "판정 불가(로그인 유도)"라는 뜻이다. `usable` 이 false 인 사유(만료·폐기·소진·모집 마감·비 ACTIVE
 * 동아리)는 구분해 내려오지 않으므로 화면도 단일 문구로만 안내한다.
 *
 * `linkType`·`autoApprove` 는 안내 문구를 가르는 근거다 — 초대 링크는 합격 문맥이 아니고,
 * 자동 승인 링크는 신청 성공이 곧 가입 완료다.
 */
export type JoinCodeCheck = {
  clubId: number;
  clubName: string;
  generation: number | null;
  usable: boolean;
  alreadyMember: boolean | null;
  myRequestStatus: JoinRequestStatus | null;
  linkType: JoinCodeLinkType;
  autoApprove: boolean;
};

// 목록에는 전화번호가 없다 — 개인정보는 상세 조회에서만 내려온다(BE 계약).
export type JoinRequestSummary = {
  joinRequestId: number;
  userName: string;
  studentId: string;
  major: string;
  code: string;
  generation: number | null;
  status: JoinRequestStatus;
  requestedAt: IsoInstantString;
  // 자동 승인 초대 링크로 접수돼 운영진 손을 거치지 않고 승인된 요청. 모집 링크 요청은 항상 false.
  autoApproved: boolean;
};

export type JoinRequestDetail = JoinRequestSummary & {
  phone: string;
  rejectReason: string | null;
  reviewedAt: IsoInstantString | null;
};

/**
 * 단건 처리 결과. `AUTO_REJECTED` 는 실패가 아니라 "승인하려 했으나 이미 가입된 회원이라
 * 인원 차감 없이 자동 거절된" 정상 경로이므로 화면에서 승인·거절과 구분해 안내한다.
 */
export type JoinRequestDecisionResult = 'APPROVED' | 'REJECTED' | 'AUTO_REJECTED';

export type DecideJoinRequestPayload = {
  status: Extract<JoinRequestStatus, 'APPROVED' | 'REJECTED'>;
};

export type JoinRequestDecisionResponse = {
  result: JoinRequestDecisionResult;
};

export type BulkApproveJoinRequestsPayload = {
  joinRequestIds: number[];
};

// 건별 트랜잭션이라 일부 성공/일부 실패가 정상 결과다. reason 은 서버 문구를 그대로 표시한다.
export type BulkApproveResult = {
  approvedCount: number;
  failures: {
    joinRequestId: number;
    reason: string;
  }[];
};
