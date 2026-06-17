package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.BankTransaction;

/**
 * PENDING 입금 거래에 자동매칭을 시도하는 매칭 결정 엔진(BE-5b).
 *
 * <p>Tier 1(전 은행): 잔액==입금액 후보가 정확히 1건이면 자동매칭한다.
 * Tier 2(KB 한정): 후보가 여러 건이면 입금자명(counterparty)으로 1건으로 좁혀 자동매칭한다.
 * 그 외(후보 0건·다건 모호)는 자동매칭하지 않고 PENDING 으로 남겨 검토 큐(BE-6)로 보낸다.
 */
public interface TransactionMatcher {

    /** PENDING 입금 거래에 자동매칭을 시도. 성공 시 true(납부 생성), 실패 시 false(검토 큐). */
    boolean tryAutoMatch(BankTransaction transaction, Long actorId);
}
