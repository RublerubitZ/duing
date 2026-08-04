package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.time.LocalDateTime;

public record ApplicationSummaryQuery(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        /**
         * 모집 마감 여부 — 지원 상태와 직교한 축이다. 마감된 모집의 미결 지원은 결과가 나오지 않은
         * 채로 종료된 것이므로, 지원자 화면이 이를 "심사 중"으로 오인하지 않으려면 반드시 필요하다.
         * 목록 쿼리가 recruitment 를 JOIN FETCH 하므로 추가 조회 없이 읽는다.
         */
        RecruitmentStatus recruitmentStatus,
        Long clubId,
        String clubName,
        ClubCategory category,
        String logoUrl,
        ApplicationStatus status,
        AssignedInterviewQuery interview,
        LocalDateTime submittedAt
) {
    /**
     * 면접 배정 정보 없이 위임한다.
     * 면접 미사용 모집 또는 단위 테스트 등 호출자가 신규 nested {@code interview} 를 알 필요 없는 경로용.
     */
    public static ApplicationSummaryQuery from(Application application) {
        return from(application, null);
    }

    /**
     * 전체 필드를 포함하는 최종 팩토리 메서드.
     * {@code interview} 는 ASSIGNED schedule + InterviewRound.location 이 모두 존재할 때만 채워지고,
     * 그 외엔 {@code null} 로 전달한다.
     */
    public static ApplicationSummaryQuery from(Application application, AssignedInterviewQuery interview) {
        return new ApplicationSummaryQuery(
                application.getId(),
                application.getRecruitment().getId(),
                application.getRecruitment().getTitle(),
                application.getRecruitment().getStatus(),
                application.getRecruitment().getClub().getId(),
                application.getRecruitment().getClub().getName(),
                application.getRecruitment().getClub().getCategory(),
                application.getRecruitment().getClub().getLogoUrl(),
                application.getStatus(),
                interview,
                application.getCreatedAt()
        );
    }
}
