package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentListItem;
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
 *
 * <p>목록 전용 세 값 — {@code pendingApplicationCount}·{@code oldestPendingSubmittedAt} 은 처리되지 않은(SUBMITTED)
 * 지원서의 수와 가장 오래된 제출 시각이며 외부 폼 모집이면 지원자 수와 같은 규칙으로 비어 있다.
 * {@code operatorsLastActiveAt} 은 회장·임원의 세션 사용·로그인 중 가장 늦은 시각이다. 상세 응답에는 싣지 않는다.
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
        Instant updatedAt,
        Long pendingApplicationCount,
        Instant oldestPendingSubmittedAt,
        Instant operatorsLastActiveAt
) {
    public static AdminRecruitmentSummaryResponse from(AdminRecruitmentListItem listItem) {
        AdminRecruitmentRow recruitmentRow = listItem.recruitmentRow();
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
                TimeMapper.systemWallClockToInstant(recruitment.getUpdatedAt()),
                // 미처리·운영진 접속 시각은 서비스가 regime 별로 이미 절대시각으로 바꿨다(TIMEZONE.md).
                listItem.pendingApplicationCount(),
                listItem.oldestPendingSubmittedAt(),
                listItem.operatorsLastActiveAt()
        );
    }
}
