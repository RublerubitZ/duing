package com.duing.domain.joincode.service.dto.query;

/**
 * 가입 요청 처리 결과.
 *
 * <p>{@code AUTO_REJECTED} 는 승인 요청이 "이미 가입된 회원"이라, {@code AUTO_REJECTED_WITHDRAWN} 은 요청자가
 * "이미 탈퇴한 계정"이라 자동 거절된 경우다 — 둘 다 예외가 아니라 정상 리턴 경로여야 상태 전이가 커밋된다
 * (예외로 던지면 롤백되어 PENDING 이 방치된다, 스펙 4.3·#1142).
 */
public enum JoinRequestDecisionResult {
    APPROVED,
    REJECTED,
    AUTO_REJECTED,
    AUTO_REJECTED_WITHDRAWN
}
