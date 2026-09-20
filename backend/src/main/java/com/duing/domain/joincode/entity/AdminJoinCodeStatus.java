package com.duing.domain.joincode.entity;

/**
 * 총동연 가입 링크 목록의 링크 상태 — 컬럼이 아니라 링크 행에서 파생한다({@link JoinCodeLinkType} 과 같은 규약).
 *
 * <p>우선순위는 {@code REVOKED > EXHAUSTED > EXPIRED > ACTIVE} 다. 폐기·소진은 기간과 무관하게 확정된
 * 사실이라 먼저 보고, 기간 판정은 {@link ClubJoinCode#isUsable(java.time.LocalDateTime)} 을 그대로 쓴다 —
 * 만료 계산식을 여기서 다시 쓰면 화면이 "사용 가능"으로 읽는 상태와 실제 사용 가능 여부가 갈린다.
 */
public enum AdminJoinCodeStatus {

    /** 아직 쓸 수 있는 링크. */
    ACTIVE,

    /** 가입 가능 기간이 지난 링크 — 모집 링크는 종료 + 프리셋, 초대 링크는 절대 만료 시각 기준. */
    EXPIRED,

    /** 사용 인원을 다 쓴 링크(usedCount >= maxUses). */
    EXHAUSTED,

    /** 폐기된 링크 — 운영진 수동 폐기·재발급의 자동 폐기·모집 삭제·동아리 폐쇄·총동연 강제 폐기가 모두 여기로 모인다. */
    REVOKED
}
