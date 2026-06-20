package com.duing.domain.fee.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class AccountNumberMaskerTest {

    private final AccountNumberMasker masker = new AccountNumberMasker();

    @ParameterizedTest(name = "[{index}] \"{0}\" -> \"{1}\"")
    @CsvSource(value = {
            "352-1234-5678-90, ****7890",
            "1002345678901,    ****8901",
            "1234,             ****",
            "123,              ****",
            "12-34,            ****",
            "'',               ****",
            "NULL,             ****",
    }, nullValues = "NULL")
    @DisplayName("계좌번호는 숫자만 추출해 끝 4자리만 노출하고, 숫자가 4자리 이하·빈값·null 이면 전체를 가린다")
    void masksAccountNumber(String accountNumber, String expected) {
        assertThat(masker.mask(accountNumber)).isEqualTo(expected);
    }
}
