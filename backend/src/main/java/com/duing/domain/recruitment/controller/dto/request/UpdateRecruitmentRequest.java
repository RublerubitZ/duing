package com.duing.domain.recruitment.controller.dto.request;

import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record UpdateRecruitmentRequest(
        @NotBlank(message = "제목은 공백일 수 없습니다.")
        @Size(max = 200, message = "제목은 200자 이하여야 합니다.")
        String title,

        String content,

        LocalDate startDate,

        LocalDate endDate,

        @Min(value = 1, message = "모집 정원은 1명 이상이어야 합니다.")
        Integer capacity,

        Boolean useInterview,

        List<String> questions
) {
    public UpdateRecruitmentCommand toCommand(Long recruitmentId, Long currentUserId) {
        return new UpdateRecruitmentCommand(
                recruitmentId,
                currentUserId,
                title,
                content,
                startDate,
                endDate,
                capacity,
                useInterview,
                questions
        );
    }
}
