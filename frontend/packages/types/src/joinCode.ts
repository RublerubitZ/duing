// 가입 링크(코드) / 가입 요청 — BE domain/joincode 응답 계약과 1:1.
// 내부 식별자·API 경로는 join-code 그대로이고, 사용자 대면 문구만 "가입 링크"로 통일했다.
import type { IsoInstantString } from './datetime';

/**
 * 운영 콘솔의 활성 가입 링크. 링크는 모집(recruitment)에 귀속되며 모집당 활성 링크는 1개다.
 *
 * ⚠️ 활성(active) 이 곧 사용 가능(usable)은 아니다 — 조회는 만료된 링크도 그대로 내려준다.
 * 절대 만료일은 없다(스펙 v2 §4.3): 가입 가능 기간은 모집 종료 시각 기준 프리셋이라
 * 모집이 진행 중이면 `joinExpiresAt` 이 null 이고, 종료된 뒤에만 실제 만료 시각이 생긴다.
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
};

export type CreateJoinCodePayload = {
  maxUses: number;
  // 0/7/14 만 허용 — 그 외 값은 BE 400.
  joinWindowDays: number;
  generation?: number;
};

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * 학생의 코드 확인 화면(`/join/{code}`) 응답.
 *
 * ⚠️ `alreadyMember`·`myRequestStatus` 는 비로그인이면 둘 다 null 이다 — "이력 없음"이 아니라
 * "판정 불가(로그인 유도)"라는 뜻이다. `usable` 이 false 인 사유(만료·폐기·소진·모집 마감·비 ACTIVE
 * 동아리)는 구분해 내려오지 않으므로 화면도 단일 문구로만 안내한다.
 */
export type JoinCodeCheck = {
  clubId: number;
  clubName: string;
  generation: number | null;
  usable: boolean;
  alreadyMember: boolean | null;
  myRequestStatus: JoinRequestStatus | null;
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
