package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentForm;
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
        // TODO(legacy-questions-v1): 신 FE 전환 후 제거 — 질문 텍스트만 담는 legacy 통로.
        List<String> questions,
        List<RecruitmentQuestion> questionItems,
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
     * questions(텍스트 배열)와 questionItems(구조화 질문)는 같은 폼을 두 형태로 노출한다 — 전자는 legacy,
     * 후자가 유형·필수 여부·선택지 id 를 담는 정본이다.
     * TODO(legacy-questions-v1): 신 FE 전환 후 questions(string[]) 필드 제거.
     */
    public static RecruitmentDetailQuery from(Recruitment recruitment,
                                              LocalDate today,
                                              Integer applicantCount,
                                              LocalDateTime interviewAvailabilityDeadline) {
        // 외부 폼 모집은 폼이 없으므로 두 필드 모두 빈 목록으로 나간다.
        RecruitmentForm form = recruitment.getForm();
        List<RecruitmentQuestion> questionItems = form == null ? List.of() : form.getQuestions();
        List<String> questions = questionItems.stream().map(RecruitmentQuestion::text).toList();
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
                questionItems,
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
