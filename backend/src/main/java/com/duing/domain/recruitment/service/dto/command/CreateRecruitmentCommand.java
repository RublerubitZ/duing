package com.duing.domain.recruitment.service.dto.command;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import java.time.LocalDate;
import java.util.List;

/**
 * 모집 공고 생성 명령. 외부폼/자체폼 분기 검증을 compact constructor 에서 수행한다.
 * - applicationMode=EXTERNAL: externalFormUrl 필수, questions 는 비어 있어야 한다.
 * - applicationMode=SELF: externalFormUrl 은 null 이어야 하며 questions 는 최소 1개.
 */
public record CreateRecruitmentCommand(
        Long clubId,
        Long currentUserId,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        List<RecruitmentQuestion> questions,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        boolean showApplicantCount
) {
    public CreateRecruitmentCommand {
        ApplicationMode resolvedMode = applicationMode == null ? ApplicationMode.SELF : applicationMode;
        TargetRole resolvedTargetRole = targetRole == null ? TargetRole.MEMBER : targetRole;
        List<RecruitmentQuestion> resolvedQuestions = questions == null ? List.of() : List.copyOf(questions);

        if (resolvedMode == ApplicationMode.EXTERNAL) {
            if (externalFormUrl == null || externalFormUrl.isBlank()) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "외부 폼 모집은 externalFormUrl 이 필수 입력값입니다.");
            }
            if (!resolvedQuestions.isEmpty()) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "외부 폼 모집에는 questions 를 함께 보낼 수 없습니다.");
            }
        } else {
            if (externalFormUrl != null) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "자체 폼 모집은 externalFormUrl 을 지정할 수 없습니다.");
            }
            if (resolvedQuestions.isEmpty()) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "자체 폼 모집은 최소 1개 이상의 질문이 필요합니다.");
            }
        }

        applicationMode = resolvedMode;
        targetRole = resolvedTargetRole;
        questions = resolvedQuestions;
    }
}
