package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.Bank;

/**
 * 회비 계좌 조회 결과. {@code accountNumber} 는 복호화된 평문 계좌번호다.
 * 복호화는 서비스 계층에서만 수행하며, 암호문이 이 쿼리에 담기는 일은 없다.
 */
public record FeeAccountQuery(Long id, Bank bank, String accountNumber, String accountHolder) {
}
