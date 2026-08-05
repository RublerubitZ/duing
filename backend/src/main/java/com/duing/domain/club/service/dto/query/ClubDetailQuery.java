package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubProject;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.entity.ContactVisibility;
import com.duing.domain.club.entity.FeeCycle;
import com.duing.domain.recruitment.service.dto.query.StudentRecruitmentProjection;
import com.duing.domain.user.entity.College;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

public record ClubDetailQuery(
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
    /**
     * leaderId / leaderName 은 ClubMember 테이블에서 role = LEADER 인 행을 조회해 주입한다.
     * 회장 부재(공석) 상황을 허용하므로 null 이 가능하다.
     * contactPhone 은 서비스에서 공개 게이트를 통과한 값만 받는다 (회장 부재 시 null).
     */
    public static ClubDetailQuery of(
            Club club,
            Long leaderId,
            String leaderName,
            String contactPhone,
            List<ClubPhotoQuery> photos,
            StudentRecruitmentProjection activeRecruitment
    ) {
        return new ClubDetailQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getCollege(),
                club.getDescription(),
                club.getLogoUrl(),
                club.getCoverUrl(),
                club.getTags(),
                club.getSnsLinks(),
                club.getFaqs(),
                leaderId,
                leaderName,
                contactPhone,
                club.getContactVisibility(),
                club.getStatus(),
                photos,
                club.getFoundedYear(),
                club.getCohortNumber(),
                club.getLocation(),
                club.getActivityFrequency(),
                club.getActiveDays(),
                club.getMembershipFeeAmount(),
                club.getFeeCycle(),
                club.getFeeNote(),
                club.getTagline(),
                club.getHighlights(),
                club.getProjects(),
                activeRecruitment,
                club.isCentralClub(),
                club.isUseGeneration()
        );
    }
}
