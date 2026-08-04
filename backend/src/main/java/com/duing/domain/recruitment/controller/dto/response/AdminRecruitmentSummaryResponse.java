package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentRow;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDate;

/**
 * 총동연 모집 목록 행.
 *
 * <p>{@code applicantCount} 는 외부 폼 모집이면 비어 있다 — 공개용 {@code showApplicantCount} 토글에
 * 종속된 값이 아니라 실제 지원서를 센 값이며, 지원 데이터가 없는 모집은 0 이 아니라 "해당 없음"이다.
 */
public record AdminRecruitmentSummaryResponse(
        Long recruitmentId,
        Long clubId,
        String clubName,
        String title,
        ApplicationMode applicationMode,
        RecruitmentStatus status,
        Long applicantCount,
        LocalDate startDate,
        LocalDate endDate,
        Instant updatedAt
) {
    public static AdminRecruitmentSummaryResponse from(AdminRecruitmentRow recruitmentRow) {
        Recruitment recruitment = recruitmentRow.recruitment();
        return new AdminRecruitmentSummaryResponse(
                recruitment.getId(),
                recruitment.getClub().getId(),
                recruitmentRow.clubName(),
                recruitment.getTitle(),
                recruitment.getApplicationMode(),
                recruitment.getStatus(),
                recruitmentRow.visibleApplicantCount(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                // updatedAt 은 JPA 감사 필드라 JVM 존 벽시계다(TIMEZONE.md — system regime).
                TimeMapper.systemWallClockToInstant(recruitment.getUpdatedAt())
        );
    }
}
