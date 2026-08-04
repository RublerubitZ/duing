package com.duing.domain.clubaudit.entity;

/**
 * 동아리 운영 감사 이벤트 종류 (스펙 v2 4.1).
 *
 * <p>현재는 가입 링크 6종뿐이다. 값을 추가할 때는 {@code club_audit_event.event_type} 의
 * CHECK 제약도 마이그레이션으로 함께 갱신해야 한다(V102).
 */
public enum ClubAuditEventType {

    /** 모집에 가입 링크를 처음 발급했다. */
    JOIN_LINK_CREATED,
    /** 기존 활성 링크를 폐기하고 새 링크를 발급했다 — 같은 트랜잭션에 구 링크의 REVOKED 가 함께 남는다. */
    JOIN_LINK_REGENERATED,
    /** 링크를 폐기했다 — 운영진 수동 폐기·재생성의 자동 폐기·모집 삭제의 자동 폐기 세 경로가 쓴다. */
    JOIN_LINK_REVOKED,
    /** 학생이 링크로 가입을 신청했다 — 이 이벤트만 actor 가 학생이다. */
    JOIN_REQUEST_CREATED,
    JOIN_REQUEST_APPROVED,
    /** 가입 요청을 거절했다 — 운영진 수동 거절과 "이미 가입된 회원" 자동 거절을 모두 포함한다. */
    JOIN_REQUEST_REJECTED
}
