package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;

/**
 * 학생 공개 화면(동아리 상세 페이지) 전용 모집 읽기 모델.
 * ClubDetail 응답에 임베드해 학생측 동아리 상세 페이지의 직렬 fetch 를 한 번으로 줄인다.
 * 운영자용 RecruitmentDetail 과는 별개로, 학생 카드 렌더링에 꼭 필요한 필드 부분집합만 노출한다.
 */
public record StudentRecruitmentProjection(
        Long id,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        RecruitmentDisplayStatus displayStatus,
        int capacity,
        boolean useInterview,
        TargetRole targetRole,
        ApplicationMode applicationMode,
        String externalFormUrl,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        Integer applicantCount
) {
    /**
     * applicantCount 는 호출자가 결정한다.
     * showApplicantCount=true 면 count 쿼리 결과를 넘기고, false 면 null 을 넘긴다.
     */
    public static StudentRecruitmentProjection from(
            Recruitment recruitment,
            LocalDate today,
            Integer applicantCount
    ) {
        return new StudentRecruitmentProjection(
                recruitment.getId(),
                recruitment.getTitle(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                RecruitmentDisplayStatus.resolve(
                        recruitment.getStatus(),
                        recruitment.getStartDate(),
                        recruitment.getEndDate(),
                        today),
                recruitment.getCapacity(),
                recruitment.isUseInterview(),
                recruitment.getTargetRole(),
                recruitment.getApplicationMode(),
                recruitment.getExternalFormUrl(),
                recruitment.getInterviewStartDate(),
                recruitment.getInterviewEndDate(),
                applicantCount
        );
    }
}
