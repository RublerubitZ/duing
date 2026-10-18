package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.user.entity.College;
import java.time.LocalDate;
import java.util.List;

public record ClubSummaryResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String department,
        String logoUrl,
        /** 로고의 384px 변형 URL(원본이 작거나 sRGB 가 아닌 RGB 색 프로파일이 붙었으면 원본 URL — 같은 값이 작은 이미지라는 뜻은 아니다). 아직 없거나 만들 수 없는 형식이면 null — 클라이언트는 logoUrl 로 폴백한다. */
        String logoThumbnailUrl,
        ClubStatus status,
        List<String> tags,
        String tagline,
        boolean centralClub,
        /**
         * 최근 7일 순방문자 수 — 홈 "관심도가 높은 동아리" 카드의 표시값.
         * 내부 정렬값(interest_score)은 노출하지 않는다. 집계 전이거나 조회가 없으면 0.
         */
        int weeklyInterestCount,
        ActiveRecruitmentSummaryResponse activeRecruitment
) {
    public record ActiveRecruitmentSummaryResponse(
            Long recruitmentId,
            RecruitmentDisplayStatus displayStatus,
            LocalDate startDate,
            LocalDate endDate
    ) {
        public static ActiveRecruitmentSummaryResponse from(ClubSummaryQuery.ActiveRecruitmentSummary source) {
            return new ActiveRecruitmentSummaryResponse(
                    source.recruitmentId(),
                    source.displayStatus(),
                    source.startDate(),
                    source.endDate()
            );
        }
    }

    public static ClubSummaryResponse from(ClubSummaryQuery summaryQuery) {
        return new ClubSummaryResponse(
                summaryQuery.id(),
                summaryQuery.name(),
                summaryQuery.category(),
                summaryQuery.division(),
                summaryQuery.college(),
                summaryQuery.department(),
                summaryQuery.logoUrl(),
                summaryQuery.logoThumbnailUrl(),
                summaryQuery.status(),
                summaryQuery.tags(),
                summaryQuery.tagline(),
                summaryQuery.centralClub(),
                summaryQuery.weeklyInterestCount(),
                summaryQuery.activeRecruitment() == null
                        ? null
                        : ActiveRecruitmentSummaryResponse.from(summaryQuery.activeRecruitment())
        );
    }
}