package com.duing.domain.recruitment.controller.dto.request;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/**
 * 모집 공고 생성 요청. 외부 폼 / 자체 폼 분기 검증은 {@link CreateRecruitmentCommand}
 * 의 compact constructor 에서 한 번에 수행되므로, 본 DTO 는 필드 단위 형식 검증만 책임진다.
 */
public record CreateRecruitmentRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 200, message = "제목은 200자 이하여야 합니다.")
        String title,

        String content,

        @NotNull(message = "모집 시작일은 필수 입력값입니다.")
        LocalDate startDate,

        LocalDate endDate,

        @Min(value = 1, message = "모집 정원은 1명 이상이어야 합니다.")
        int capacity,

        ApplicationMode applicationMode,

        @Size(max = 500, message = "외부 폼 URL 은 500자 이하여야 합니다.")
        @Pattern(regexp = "^$|^https?://.+$", message = "링크는 http:// 또는 https:// 로 시작해야 합니다.")
        String externalFormUrl,

        Boolean useInterview,

        TargetRole targetRole,

        List<@NotBlank(message = "질문 항목은 빈 문자열일 수 없습니다.") String> questions,

        LocalDate interviewStartDate,

        LocalDate interviewEndDate,

        Boolean showApplicantCount
) {
    public CreateRecruitmentCommand toCommand(Long clubId, Long currentUserId) {
        return new CreateRecruitmentCommand(
                clubId,
                currentUserId,
                title,
                content,
                startDate,
                endDate,
                capacity,
                applicationMode,
                externalFormUrl,
                Boolean.TRUE.equals(useInterview),
                targetRole,
                questions,
                interviewStartDate,
                interviewEndDate,
                Boolean.TRUE.equals(showApplicantCount)
        );
    }
}
