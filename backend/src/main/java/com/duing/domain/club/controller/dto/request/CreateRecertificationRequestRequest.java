package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateRecertificationRequestRequest(
        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "이메일 형식이 올바르지 않습니다.")
        @Size(max = 255, message = "이메일은 255자 이하여야 합니다.") String contactEmail,
        @NotBlank(message = "연락처는 필수입니다.")
        @Size(max = 40, message = "연락처는 40자 이하여야 합니다.") String contactPhone,
        @Min(value = 2000, message = "운영 연도는 2000 이상이어야 합니다.")
        @Max(value = 2100, message = "운영 연도는 2100 이하여야 합니다.") int operatingYear,
        @Size(max = 2000, message = "메모는 2000자 이하여야 합니다.") String notes
) {
    public CreateRecertificationCommand toCommand(Long clubId, Long requesterUserId) {
        return new CreateRecertificationCommand(
                clubId, requesterUserId, contactEmail, contactPhone, operatingYear, notes);
    }
}
