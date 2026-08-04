// 가입 코드 / 가입 요청 — BE domain/joincode 응답 계약과 1:1.
import type { IsoInstantString } from './datetime';

/**
 * 운영 콘솔의 활성 가입 코드. 코드는 모집(recruitment)에 귀속되며 모집당 활성 코드는 1개다.
 *
 * ⚠️ 활성(active) 이 곧 사용 가능(usable)은 아니다 — 조회는 만료된 코드도 그대로 내려준다.
 * 모집 상태는 사용 가능 여부를 좌우하지 않으므로(스펙 v2 §4.2) 화면은 `expiresAt` 경과만 본다.
 */
export type JoinCodeSummary = {
  joinCodeId: number;
  code: string;
  // 코드로 가입한 회원에게 찍힐 기수 스냅샷. 미지정이면 null.
  generation: number | null;
  maxUses: number;
  usedCount: number;
  expiresAt: IsoInstantString;
};

export type CreateJoinCodePayload = {
  maxUses: number;
  expiresInDays: number;
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
