package com.duing.domain.application.controller.dto.request;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record SubmitApplicationRequest(
        @NotNull(message = "답변 목록은 필수 입력값입니다.")
        List<String> answers,

        @NotNull(message = "면접 슬롯 목록은 필수 입력값입니다.")
        List<Long> interviewSlotIds
) {
    public SubmitApplicationCommand toCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, answers, interviewSlotIds);
    }
}