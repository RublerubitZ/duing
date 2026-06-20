package com.duing.domain.fee.support;

/**
 * BANK 자동매칭 계좌 등록·해제 관련 구조화 로그 이벤트명. 장애 추적·운영 분석에 쓴다.
 * PII(계좌번호·예금주)는 이 이벤트와 함께 절대 기록하지 않는다(clubId·event·errorCode 만).
 */
public enum BankAccountAuditEvent {
    BANK_ACCOUNT_REGISTERED,
    BANK_ACCOUNT_UNREGISTERED,
    BANK_ACCOUNT_UNREGISTER_FAILED,
    BANK_ACCOUNT_FORCE_DEACTIVATED,
}
