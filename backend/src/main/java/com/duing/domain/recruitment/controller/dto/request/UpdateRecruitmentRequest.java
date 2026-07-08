package com.duing.domain.recruitment.controller.dto.request;

import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record UpdateRecruitmentRequest(
        @Size(max = 200, message = "제목은 200자 이하여야 합니다.")
        String title,

        String content,

        LocalDate startDate,

        LocalDate endDate,

        @Min(value = 1, message = "모집 정원은 1명 이상이어야 합니다.")
        Integer capacity,

        Boolean useInterview,

        // 질문 개수 상한(50)은 CreateRecruitmentRequest·지원서 답변 개수 상한과 일치해야 한다
        // (제출 시 answers.size() == questions.size() 검증). 상세는 CreateRecruitmentRequest 주석 참조.
        @Size(max = 50, message = "질문은 최대 50개까지 등록할 수 있습니다.")
        List<@NotBlank(message = "질문 항목은 빈 문자열일 수 없습니다.")
                @Size(max = 500, message = "질문은 500자 이하여야 합니다.") String> questions,

        LocalDate interviewStartDate,

        LocalDate interviewEndDate,

        Boolean showApplicantCount
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
                questions,
                interviewStartDate,
                interviewEndDate,
                showApplicantCount
        );
    }
}
