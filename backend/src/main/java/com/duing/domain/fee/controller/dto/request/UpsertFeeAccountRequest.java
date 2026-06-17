package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.service.dto.command.UpsertFeeAccountCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 회비 계좌 등록·수정 요청. {@code accountNumber} 는 평문이며 저장 직전 서버가 암호화한다.
 *
 * <p>{@code @Size(max = 30)} 으로 평문 길이를 제한해, base64 암호문이 {@code account_number}
 * VARCHAR(255) 컬럼에 안전하게 들어가도록 보장한다.
 */
public record UpsertFeeAccountRequest(
        @NotNull(message = "은행은 필수입니다.") Bank bank,
        @NotBlank(message = "계좌번호는 필수입니다.")
        @Size(max = 30, message = "계좌번호는 30자 이하여야 합니다.")
        @Pattern(regexp = "^[0-9-]+$", message = "계좌번호는 숫자와 하이픈(-)만 입력할 수 있습니다.")
        String accountNumber,
        @NotBlank(message = "예금주는 필수입니다.")
        @Size(max = 50, message = "예금주는 50자 이하여야 합니다.")
        String accountHolder) {

    public UpsertFeeAccountCommand toCommand(Long clubId, Long actorId) {
        return new UpsertFeeAccountCommand(clubId, actorId, bank, accountNumber, accountHolder);
    }
}
