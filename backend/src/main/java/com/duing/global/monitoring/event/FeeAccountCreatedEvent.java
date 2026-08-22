package com.duing.global.monitoring.event;

import com.duing.domain.fee.entity.Bank;

/** 회비 계좌 최초 등록(갱신·무변경 저장은 제외). 계좌번호·예금주는 싣지 않는다 — 은행 코드만. */
public record FeeAccountCreatedEvent(Long clubId, Long feeAccountId, Bank bank, Long actorUserId) {
}
