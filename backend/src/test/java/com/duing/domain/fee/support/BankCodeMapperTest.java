package com.duing.domain.fee.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.fee.entity.Bank;
import com.duing.global.bank.exception.BankApiException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class BankCodeMapperTest {

    private final BankCodeMapper mapper = new BankCodeMapper();

    @Test
    @DisplayName("농협·KB국민·우리은행은 각각 NH·KB·WR 코드로 매핑된다")
    void mapsSupportedBanksToApiCodes() {
        assertThat(mapper.toApiCode(Bank.NH)).isEqualTo("NH");
        assertThat(mapper.toApiCode(Bank.KB)).isEqualTo("KB");
        assertThat(mapper.toApiCode(Bank.WOORI)).isEqualTo("WR");
    }

    @Test
    @DisplayName("자동매칭을 지원하지 않는 은행을 매핑하면 UnsupportedBankException 을 던진다")
    void rejectsUnsupportedBank() {
        assertThatThrownBy(() -> mapper.toApiCode(Bank.SHINHAN))
                .isInstanceOf(BankApiException.UnsupportedBankException.class);
    }

    @Test
    @DisplayName("지원 은행 3종(NH·KB·WOORI)은 isEligible 이 true 다")
    void eligibleForSupportedBanks() {
        assertThat(mapper.isEligible(Bank.NH)).isTrue();
        assertThat(mapper.isEligible(Bank.KB)).isTrue();
        assertThat(mapper.isEligible(Bank.WOORI)).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = Bank.class, names = {"NH", "KB", "WOORI"}, mode = EnumSource.Mode.EXCLUDE)
    @DisplayName("지원하지 않는 은행은 모두 isEligible 이 false 다")
    void notEligibleForUnsupportedBanks(Bank unsupportedBank) {
        assertThat(mapper.isEligible(unsupportedBank)).isFalse();
    }
}
