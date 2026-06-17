package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.service.dto.query.FeeAccountQuery;

/**
 * 회비 계좌 응답. {@code accountNumber} 는 복호화된 평문이다.
 * 은행 한글 표시명은 프론트엔드가 Bank 코드로 매핑하므로 코드만 내려준다.
 */
public record FeeAccountResponse(Bank bank, String accountNumber, String accountHolder) {

    public static FeeAccountResponse from(FeeAccountQuery query) {
        return new FeeAccountResponse(query.bank(), query.accountNumber(), query.accountHolder());
    }
}
