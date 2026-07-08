package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record RecruitmentDetailResponse(
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
        List<QuestionItemResponse> questionItems,
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
     * questions 와 questionItems 는 같은 폼을 두 형태로 노출한다 — 지원서 작성 화면은 questionItems 를 읽어
     * 유형·필수 여부·선택지 id 를 얻고, questions 는 구 FE 호환용 텍스트 배열이다.
     */
    public static RecruitmentDetailResponse from(RecruitmentDetailQuery detailQuery) {
        List<QuestionItemResponse> questionItems = detailQuery.questionItems().stream()
                .map(QuestionItemResponse::from)
                .toList();
        return new RecruitmentDetailResponse(
                detailQuery.id(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                detailQuery.title(),
                detailQuery.content(),
                detailQuery.startDate(),
                detailQuery.endDate(),
                detailQuery.capacity(),
                detailQuery.status(),
                detailQuery.displayStatus(),
                detailQuery.effectivelyOpen(),
                detailQuery.questions(),
                questionItems,
                detailQuery.applicationMode(),
                detailQuery.externalFormUrl(),
                detailQuery.useInterview(),
                detailQuery.targetRole(),
                detailQuery.interviewStartDate(),
                detailQuery.interviewEndDate(),
                detailQuery.showApplicantCount(),
                detailQuery.applicantCount(),
                detailQuery.interviewAvailabilityDeadline()
        );
    }
}
