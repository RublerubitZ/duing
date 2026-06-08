package com.duing.domain.application.controller.dto.request;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record SubmitApplicationRequest(
        @NotNull(message = "답변 목록은 필수 입력값입니다.")
        List<String> answers,

        // 일반 모집 backward-compat: 면접 모집이 아닌 클라이언트는 이 필드를 보내지 않을 수 있다.
        // null 이면 빈 리스트로 정규화하여 service 의 "면접 미사용" 경로를 그대로 탄다.
        List<Long> interviewSlotIds
) {
    public SubmitApplicationCommand toCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, answers,
                interviewSlotIds == null ? List.of() : interviewSlotIds);
    }
}