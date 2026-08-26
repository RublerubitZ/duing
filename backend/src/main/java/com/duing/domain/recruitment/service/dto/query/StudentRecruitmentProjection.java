package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
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
     *
     * <p>스칼라 projection 행 전용 — 엔티티를 받는 오버로드는 두지 않는다. 대표 모집을 엔티티로
     * 읽는 순간 form eager +1 쿼리와 content TEXT 전송이 재유입된다(성능 감사 P1-6).
     */
    public static StudentRecruitmentProjection from(
            RepresentativeRecruitmentRow row,
            LocalDate today,
            Integer applicantCount
    ) {
        return new StudentRecruitmentProjection(
                row.id(),
                row.title(),
                row.startDate(),
                row.endDate(),
                RecruitmentDisplayStatus.resolve(row.status(), row.startDate(), row.endDate(), today),
                row.capacity(),
                row.useInterview(),
                row.targetRole(),
                row.applicationMode(),
                row.externalFormUrl(),
                row.interviewStartDate(),
                row.interviewEndDate(),
                applicantCount
        );
    }
}
