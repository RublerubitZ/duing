package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record RecruitmentDetailQuery(
        Long id,
        Long clubId,
        String clubName,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        List<String> questions,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        boolean showApplicantCount,
        Integer applicantCount,
        LocalDateTime interviewAvailabilityDeadline
) {
    /**
     * applicantCount 는 showApplicantCount=false 일 때 null 로 전달한다 (응답 노출 차단).
     * interviewAvailabilityDeadline 은 라운드 모델 전환 후 호환용 필드로 항상 null 이다 (FE 재배선 후 제거 예정).
     * TODO(legacy-questions-v1): 신 FE 전환 후 questions(string[]) 필드 제거.
     */
    public static RecruitmentDetailQuery from(Recruitment recruitment,
                                              LocalDate today,
                                              Integer applicantCount,
                                              LocalDateTime interviewAvailabilityDeadline) {
        List<String> questions = recruitment.getForm() != null
                ? recruitment.getForm().getQuestions().stream().map(RecruitmentQuestion::text).toList()
                : List.of();
        return new RecruitmentDetailQuery(
                recruitment.getId(),
                recruitment.getClub().getId(),
                recruitment.getClub().getName(),
                recruitment.getTitle(),
                recruitment.getContent(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                recruitment.getCapacity(),
                recruitment.getStatus(),
                RecruitmentDisplayStatus.resolve(
                        recruitment.getStatus(),
                        recruitment.getStartDate(),
                        recruitment.getEndDate(),
                        today),
                recruitment.isEffectivelyOpen(today),
                questions,
                recruitment.getApplicationMode(),
                recruitment.getExternalFormUrl(),
                recruitment.isUseInterview(),
                recruitment.getTargetRole(),
                recruitment.getInterviewStartDate(),
                recruitment.getInterviewEndDate(),
                recruitment.isShowApplicantCount(),
                applicantCount,
                interviewAvailabilityDeadline
        );
    }
}
