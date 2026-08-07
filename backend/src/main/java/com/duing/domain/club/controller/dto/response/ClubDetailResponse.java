package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubProject;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.entity.ContactVisibility;
import com.duing.domain.club.entity.FeeCycle;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import com.duing.domain.recruitment.service.dto.query.StudentRecruitmentProjection;
import com.duing.domain.user.entity.College;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

public record ClubDetailResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String description,
        String logoUrl,
        String coverUrl,
        List<String> tags,
        List<ClubSnsLink> snsLinks,
        List<ClubFaq> faqs,
        Long leaderId,
        String leaderName,
        String contactPhone,
        ContactVisibility contactVisibility,
        ClubStatus status,
        List<ClubPhotoQuery> photos,
        Integer foundedYear,
        Integer cohortNumber,
        String location,
        Integer activityFrequency,
        Set<DayOfWeek> activeDays,
        Integer membershipFeeAmount,
        FeeCycle feeCycle,
        String feeNote,
        String tagline,
        List<String> highlights,
        List<ClubProject> projects,
        /**
         * 대표 모집 — 진행 중인 모집이 없으면 가장 최근 마감 모집이 실린다(목록 카드와 같은 규칙).
         * 이름과 달리 마감 모집도 담기므로 지원 가능 여부는 반드시 displayStatus 로 판정한다.
         */
        StudentRecruitmentProjection activeRecruitment,
        boolean centralClub,
        boolean useGeneration
) {
    public static ClubDetailResponse from(ClubDetailQuery detailQuery) {
        return new ClubDetailResponse(
                detailQuery.id(),
                detailQuery.name(),
                detailQuery.category(),
                detailQuery.division(),
                detailQuery.college(),
                detailQuery.description(),
                detailQuery.logoUrl(),
                detailQuery.coverUrl(),
                detailQuery.tags(),
                detailQuery.snsLinks(),
                detailQuery.faqs(),
                detailQuery.leaderId(),
                detailQuery.leaderName(),
                detailQuery.contactPhone(),
                detailQuery.contactVisibility(),
                detailQuery.status(),
                detailQuery.photos(),
                detailQuery.foundedYear(),
                detailQuery.cohortNumber(),
                detailQuery.location(),
                detailQuery.activityFrequency(),
                detailQuery.activeDays(),
                detailQuery.membershipFeeAmount(),
                detailQuery.feeCycle(),
                detailQuery.feeNote(),
                detailQuery.tagline(),
                detailQuery.highlights(),
                detailQuery.projects(),
                detailQuery.activeRecruitment(),
                detailQuery.centralClub(),
                detailQuery.useGeneration()
        );
    }
}
