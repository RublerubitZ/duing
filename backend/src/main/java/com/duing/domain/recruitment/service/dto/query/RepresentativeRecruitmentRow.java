package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;

/**
 * 동아리 상세의 대표 모집 단건 조회용 스칼라 projection 행.
 *
 * <p>엔티티로 읽으면 mappedBy {@code @OneToOne} form 이 사실상 eager 라 questions jsonb 를 끄는
 * +1 쿼리가 붙고, 응답에 쓰지 않는 content TEXT 까지 실려 온다({@link RecruitmentSummaryRow} 와
 * 같은 배경 — 성능 감사 P1-6). 이 행은 {@link StudentRecruitmentProjection} 조립에 필요한 컬럼만
 * 담는다. clubName 은 상세 응답이 Club 에서 이미 갖고 있어 넣지 않는다(club join 자체가 불필요).
 *
 * <p>{@code showApplicantCount} 는 응답 필드가 아니라 "지원자 수 count 쿼리를 실행할지" 를
 * 호출자(GeneralClubService)가 판정하는 데 쓴다.
 */
public record RepresentativeRecruitmentRow(
        Long id,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        boolean showApplicantCount
) {
}
