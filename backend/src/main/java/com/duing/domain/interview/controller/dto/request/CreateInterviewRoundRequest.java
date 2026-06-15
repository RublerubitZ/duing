package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.CreateInterviewRoundCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewRoundRequest(
        @NotBlank(message = "라운드 제목은 필수 입력값입니다.")
        @Size(max = 100, message = "라운드 제목은 100자 이하여야 합니다.")
        String title,

        // DRAFT 동안 생략 가능 — 발송(DRAFT→COLLECTING) 시점에 필수가 된다 (스펙 §5.1).
        LocalDateTime availabilityDeadline,

        @Size(max = 200, message = "면접 장소는 200자 이하여야 합니다.")
        String location,

        @NotEmpty(message = "면접 대상자 목록은 필수 입력값입니다.")
        List<Long> applicationIds
) {
    public CreateInterviewRoundCommand toCommand(Long recruitmentId, Long currentUserId) {
        return new CreateInterviewRoundCommand(
                recruitmentId, currentUserId, title, availabilityDeadline, location, applicationIds);
    }
}
