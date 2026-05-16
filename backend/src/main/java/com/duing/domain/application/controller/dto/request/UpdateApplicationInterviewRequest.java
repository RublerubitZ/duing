package com.duing.domain.application.controller.dto.request;

import com.duing.domain.application.service.dto.command.UpdateInterviewCommand;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateApplicationInterviewRequest(
        @NotNull(message = "면접 일시는 필수 입력값입니다.")
        @Future(message = "면접 일시는 현재 시각 이후여야 합니다.")
        LocalDateTime interviewAt,

        @NotBlank(message = "면접 장소는 필수 입력값입니다.")
        @Size(max = 200, message = "면접 장소는 200자 이하여야 합니다.")
        String interviewLocation
) {
    public UpdateInterviewCommand toCommand(Long applicationId, Long currentUserId) {
        return new UpdateInterviewCommand(applicationId, currentUserId, interviewAt, interviewLocation);
    }
}