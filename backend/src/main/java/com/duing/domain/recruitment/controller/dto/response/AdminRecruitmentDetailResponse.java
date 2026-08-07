package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentRow;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDate;

/**
 * 총동연 모집 상세. 목록 항목에 외부 폼 주소와 가입 링크 현황을 더한다.
 *
 * <p>{@code joinLink} 는 외부 폼 모집에 활성 코드가 있을 때만 채워진다 — 비어 있으면 화면은
 * "코드 없음"으로 읽는다(폐기된 코드는 활성 조회에서 이미 빠진다).
 */
public record AdminRecruitmentDetailResponse(
        Long recruitmentId,
        Long clubId,
        String clubName,
        String title,
        ApplicationMode applicationMode,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        Long applicantCount,
        LocalDate startDate,
        LocalDate endDate,
        Instant closedAt,
        Instant updatedAt,
        String externalFormUrl,
        AdminJoinLinkStatusResponse joinLink
) {
    public static AdminRecruitmentDetailResponse from(AdminRecruitmentDetailQuery detailQuery) {
        AdminRecruitmentRow recruitmentRow = detailQuery.recruitmentRow();
        Recruitment recruitment = recruitmentRow.recruitment();
        return new AdminRecruitmentDetailResponse(
                recruitment.getId(),
                recruitment.getClub().getId(),
                recruitmentRow.clubName(),
                recruitment.getTitle(),
                recruitment.getApplicationMode(),
                recruitment.getStatus(),
                recruitmentRow.displayStatus(),
                recruitmentRow.visibleApplicantCount(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                // closedAt 은 도메인이 seoulClock 으로 찍은 벽시계다(TIMEZONE.md — seoul regime).
                TimeMapper.seoulWallClockToInstant(recruitment.getClosedAt()),
                // updatedAt 은 JPA 감사 필드라 JVM 존 벽시계다(TIMEZONE.md — system regime).
                TimeMapper.systemWallClockToInstant(recruitment.getUpdatedAt()),
                recruitment.getExternalFormUrl(),
                detailQuery.joinCode() == null ? null
                        : AdminJoinLinkStatusResponse.from(detailQuery.joinCode(),
                                detailQuery.joinLinkStatus())
        );
    }
}
