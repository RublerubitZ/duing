package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import com.duing.domain.recruitment.service.dto.query.StudentRecruitmentProjection;
<<<<<<< HEAD
import com.duing.domain.user.entity.College;
=======
>>>>>>> origin/main
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
        ClubStatus status,
        List<ClubPhotoQuery> photos,
        Integer foundedYear,
        Integer cohortNumber,
        String location,
        String contactEmail,
        Integer activityFrequency,
        Set<DayOfWeek> activeDays,
        String membershipFee,
<<<<<<< HEAD
        String tagline,
        List<String> highlights,
        String majorProjects,
        StudentRecruitmentProjection activeRecruitment,
        boolean centralClub
=======
        StudentRecruitmentProjection activeRecruitment
>>>>>>> origin/main
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
                detailQuery.status(),
                detailQuery.photos(),
                detailQuery.foundedYear(),
                detailQuery.cohortNumber(),
                detailQuery.location(),
                detailQuery.contactEmail(),
                detailQuery.activityFrequency(),
                detailQuery.activeDays(),
                detailQuery.membershipFee(),
<<<<<<< HEAD
                detailQuery.tagline(),
                detailQuery.highlights(),
                detailQuery.majorProjects(),
                detailQuery.activeRecruitment(),
                detailQuery.centralClub()
=======
                detailQuery.activeRecruitment()
>>>>>>> origin/main
        );
    }
}
