package com.duing.domain.clubaudit.entity;

/**
 * 동아리 운영 감사 이벤트 종류 (스펙 v2 4.1).
 *
 * <p>가입 링크 6종과 총동연 조치 2종, 회비 15종(V105)이 있다. 값을 추가할 때는
 * {@code club_audit_event.event_type} 의 CHECK 제약도 마이그레이션으로 함께 갱신해야 한다(V102·V104·V105).
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
    JOIN_REQUEST_REJECTED,
    /** 총동연이 진행 중인 모집을 강제로 마감했다 — 사유(reason)가 함께 남는다. */
    RECRUITMENT_FORCE_CLOSED,
    /** 총동연이 지원서 상세를 열람했다 — 개인정보 열람 이력이 목적이라 열람마다 남긴다(중복 제거 없음). */
    APPLICATION_VIEWED,
    /** 운영진이 회비 정책을 만들었다. */
    FEE_POLICY_CREATED,
    /** 운영진이 회비 정책을 수정했다 — detail 에 금액 old/new 와 변경 필드 목록이 남는다. */
    FEE_POLICY_UPDATED,
    FEE_POLICY_DELETED,
    /**
     * 운영진이 청구를 일괄 발행했다 — 발행 액션 1회당 1건, detail 에 발행 건수·회차가 남는다.
     * 자동 발행 잡은 계측하지 않는다(스펙 §15 결정 4).
     */
    FEE_BILL_ISSUED,
    FEE_BILL_CANCELLED,
    /** 납부가 기록됐다 — 수기 기록과 BANK 매칭 생성 모두 포함, detail.autoMatched 로 구분한다. */
    FEE_PAYMENT_RECORDED,
    /** 납부가 정정(VOID)됐다 — 운영진 직접 정정과 매칭취소(unmatch) 경유 모두 포함, reason 에 정정 사유가 남는다. */
    FEE_PAYMENT_VOIDED,
    FEE_TX_MANUAL_MATCHED,
    FEE_TX_IGNORED,
    /** 매칭이 취소됐다 — 같은 트랜잭션에 FEE_PAYMENT_VOIDED 가 함께 남는다(엔티티 직접 void 경로라 별도 기록, 스펙 §4). */
    FEE_TX_UNMATCHED,
    FEE_ACCOUNT_REGISTERED,
    FEE_ACCOUNT_UPDATED,
    FEE_ACCOUNT_DELETED,
    /** 총동연이 회비 감사 상세에 진입했다 — 열람 감사(상세 진입 1회 = 1건, 스펙 §15 결정 5). */
    FEE_ADMIN_DETAIL_VIEWED,
    /** 총동연이 회비 CSV 를 내려받았다(P2 예정 — CHECK 재작성을 아끼려 미리 등록). */
    FEE_ADMIN_CSV_DOWNLOADED
}
