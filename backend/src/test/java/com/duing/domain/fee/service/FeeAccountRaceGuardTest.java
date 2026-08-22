package com.duing.domain.fee.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.exception.FeeAccountException;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.fee.service.dto.command.UpsertFeeAccountCommand;
import com.duing.global.crypto.FeeAccountCipher;
import java.sql.SQLException;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * 계좌 선조회(findByClubId)를 함께 통과한 동시 첫 등록이 전역 핸들러의 generic 409 가 아니라
 * 도메인 경합 409 로 표면화되는지, 그리고 그 변환이 uk_fee_account_club 하나로만 좁혀졌는지 고정한다.
 */
class FeeAccountRaceGuardTest {

    private final FeeAccountRepository feeAccountRepository = mock(FeeAccountRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final FeeAccountCipher feeAccountCipher = mock(FeeAccountCipher.class);
    private final BankMatchingAdminService bankMatchingAdminService = mock(BankMatchingAdminService.class);
    private final ClubAuditEventRepository clubAuditEventRepository = mock(ClubAuditEventRepository.class);
    private final GeneralFeeAccountService feeAccountService = new GeneralFeeAccountService(
            feeAccountRepository, clubAuthService, feeAccountCipher,
            bankMatchingAdminService, clubAuditEventRepository);

    private static final UpsertFeeAccountCommand COMMAND =
            new UpsertFeeAccountCommand(1L, 10L, Bank.KB, "111-111-111", "두잉회비");

    @Test
    @DisplayName("선조회를 함께 통과한 동시 첫 등록이 uk_fee_account_club 에 걸리면 경합 409 로 표면화된다")
    void racedFirstRegistrationSurfacesAsConcurrentRegistration() {
        stubHappyPathUntilInsert();
        doThrow(uniqueViolation("uk_fee_account_club")).when(feeAccountRepository).flush();

        assertThatThrownBy(() -> feeAccountService.upsert(COMMAND))
                .isInstanceOf(FeeAccountException.ConcurrentRegistrationException.class);
    }

    @Test
    @DisplayName("계좌 등록 경로의 다른 제약 위반은 경합 409 로 둔갑하지 않고 그대로 전파된다")
    void unrelatedViolationIsRethrown() {
        stubHappyPathUntilInsert();
        DataIntegrityViolationException foreignViolation = uniqueViolation("uk_other_constraint");
        doThrow(foreignViolation).when(feeAccountRepository).flush();

        assertThatThrownBy(() -> feeAccountService.upsert(COMMAND)).isSameAs(foreignViolation);
    }

    private void stubHappyPathUntilInsert() {
        when(bankMatchingAdminService.isActiveUsable(1L)).thenReturn(false);
        when(feeAccountRepository.findByClubId(1L)).thenReturn(Optional.empty());
        when(feeAccountCipher.encrypt(anyString(), anyLong())).thenReturn("encrypted");
        when(feeAccountRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private static DataIntegrityViolationException uniqueViolation(String constraintName) {
        return new DataIntegrityViolationException("wrapper", new SQLException(
                "duplicate key value violates unique constraint \"" + constraintName + "\"", "23505"));
    }
}
