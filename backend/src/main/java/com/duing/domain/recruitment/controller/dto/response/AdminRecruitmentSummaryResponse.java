package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
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
 *
 * <p>{@code status} 와 {@code displayStatus} 를 함께 내린다. 강제 마감 가능 여부 같은 액션 게이트는
 * 저장 상태를, 화면 표기는 표시 상태를 본다 — 총동연 콘솔만 저장 상태를 그대로 적어 같은 모집이
 * 총동연 "모집중" / 학생 "모집마감"으로 갈리던 것을 없앤다(#896).
 */
public record AdminRecruitmentSummaryResponse(
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
                recruitmentRow.displayStatus(),
                recruitmentRow.visibleApplicantCount(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                // closedAt 은 도메인이 seoulClock 으로 찍은 벽시계다(TIMEZONE.md — seoul regime).
                TimeMapper.seoulWallClockToInstant(recruitment.getClosedAt()),
                // updatedAt 은 JPA 감사 필드라 JVM 존 벽시계다(TIMEZONE.md — system regime).
                TimeMapper.systemWallClockToInstant(recruitment.getUpdatedAt())
        );
    }
}
