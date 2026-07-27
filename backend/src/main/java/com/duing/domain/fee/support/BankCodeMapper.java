package com.duing.domain.fee.support;

import com.duing.domain.fee.entity.Bank;
import com.duing.global.bank.exception.BankApiException;
import org.springframework.stereotype.Component;

/**
 * 도메인 {@link Bank} enum 을 BANK API 가 요구하는 은행 코드 문자열로 변환한다.
 * 자동매칭은 제공사의 <b>무로그인 조회 4개 은행</b> — 농협(NH)·KB국민(KB)·우리(WR)·기업(IBK) 을 지원한다.
 * 신한(SH)은 인터넷뱅킹 로그인이 필요한 별도 엔드포인트({@code /v1/transactions/login}) 대상이라 제외한다.
 */
@Component
public class BankCodeMapper {

    public String toApiCode(Bank bank) {
        return switch (bank) {
            case NH -> "NH";
            case KB -> "KB";
            case WOORI -> "WR";
            case IBK -> "IBK";
            default -> throw new BankApiException.UnsupportedBankException();
        };
    }

    public boolean isEligible(Bank bank) {
        return bank == Bank.NH || bank == Bank.KB || bank == Bank.WOORI || bank == Bank.IBK;
    }
}
