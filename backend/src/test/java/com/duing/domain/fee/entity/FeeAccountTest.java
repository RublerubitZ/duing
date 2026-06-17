package com.duing.domain.fee.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FeeAccountTest {

    @Test
    @DisplayName("계좌를 생성하면 전달한 동아리·은행·계좌번호·예금주가 그대로 설정된다")
    void createSetsFields() {
        FeeAccount account = FeeAccount.create(1L, Bank.KB, "ENCRYPTED_TOKEN", "두잉동아리");

        assertThat(account.getClubId()).isEqualTo(1L);
        assertThat(account.getBank()).isEqualTo(Bank.KB);
        assertThat(account.getAccountNumber()).isEqualTo("ENCRYPTED_TOKEN");
        assertThat(account.getAccountHolder()).isEqualTo("두잉동아리");
    }

    @Test
    @DisplayName("계좌를 수정하면 전달한 필드만 갱신되고 null 필드는 기존 값을 유지한다")
    void updateAppliesOnlyNonNullFields() {
        FeeAccount account = FeeAccount.create(1L, Bank.KB, "OLD_TOKEN", "기존예금주");

        account.update(Bank.TOSS, "NEW_TOKEN", null);

        assertThat(account.getBank()).isEqualTo(Bank.TOSS);
        assertThat(account.getAccountNumber()).isEqualTo("NEW_TOKEN");
        assertThat(account.getAccountHolder()).isEqualTo("기존예금주");
    }
}
