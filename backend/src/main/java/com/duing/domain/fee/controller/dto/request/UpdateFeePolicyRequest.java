package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.service.dto.command.UpdateFeePolicyCommand;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record UpdateFeePolicyRequest(
        // 부분 수정: name 미전송(null)은 기존 값 유지. @Pattern·@Size 는 null 을 통과시키므로 의미 보존된다.
        // 전송 시 공백("" / "   ")으로 기존 이름을 덮어쓰는 것만 @Pattern(비공백 1자 이상)으로 차단한다.
        @Pattern(regexp = "^\\s*\\S.*$", message = "정책 이름은 공백일 수 없습니다.")
        @Size(max = 100, message = "정책 이름은 100자 이하여야 합니다.") String name,
        @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") Long amount,
        BillingType billingType, Boolean active) {

    public UpdateFeePolicyCommand toCommand(Long clubId, Long actorId, Long policyId) {
        return new UpdateFeePolicyCommand(clubId, actorId, policyId, name, amount, billingType, active);
    }
}
