package com.duing.domain.fee.support;

import com.duing.domain.fee.entity.Bank;
import com.duing.global.bank.exception.BankApiException;
import org.springframework.stereotype.Component;

/**
 * 도메인 {@link Bank} enum 을 BANK API 가 요구하는 은행 코드 문자열로 변환한다.
 * 자동매칭은 농협(NH)·KB국민(KB)·우리(WR) 만 지원한다.
 */
@Component
public class BankCodeMapper {

    public String toApiCode(Bank bank) {
        return switch (bank) {
            case NH -> "NH";
            case KB -> "KB";
            case WOORI -> "WR";
            default -> throw new BankApiException.UnsupportedBankException();
        };
    }

    public boolean isEligible(Bank bank) {
        return bank == Bank.NH || bank == Bank.KB || bank == Bank.WOORI;
    }
}
