package com.duing.domain.recruitment.controller.dto.request;

import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record CreateRecruitmentRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 200, message = "제목은 200자 이하여야 합니다.")
        String title,

        String content,

        @NotNull(message = "모집 시작일은 필수 입력값입니다.")
        LocalDate startDate,

        @NotNull(message = "모집 종료일은 필수 입력값입니다.")
        LocalDate endDate,

        @Min(value = 1, message = "모집 정원은 1명 이상이어야 합니다.")
        int capacity,

        List<String> questions
) {
    public CreateRecruitmentCommand toCommand(Long clubId, Long currentUserId) {
        return new CreateRecruitmentCommand(
                clubId, currentUserId, title, content, startDate, endDate, capacity,
                questions == null ? List.of() : questions
        );
    }
}