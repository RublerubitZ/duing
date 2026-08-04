package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import com.duing.global.time.TimeMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;

/**
 * 모집 요약(공개 목록·캘린더 공용) 응답.
 *
 * <p>{@code closedAt} 은 마감 아카이브의 정렬·표기 기준이며, 마감은 공개 정보라 캘린더 응답에도 함께 나간다.
 * seoulClock 벽시계로 기록되므로 KST 기준으로 절대시각 변환한다(TIMEZONE.md).
 */
public record RecruitmentSummaryResponse(
        Long id,
        Long clubId,
        String clubName,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        @Schema(description = "수동·자동 마감이 실제로 일어난 시각. 마감 전이거나 종료 시각이 기록되지 않은 레거시 마감 건은 null 이다.",
                example = "2026-08-04T03:00:00Z")
        Instant closedAt
) {
    public static RecruitmentSummaryResponse from(RecruitmentSummaryQuery summaryQuery) {
        return new RecruitmentSummaryResponse(
                summaryQuery.id(),
                summaryQuery.clubId(),
                summaryQuery.clubName(),
                summaryQuery.title(),
                summaryQuery.startDate(),
                summaryQuery.endDate(),
                summaryQuery.capacity(),
                summaryQuery.status(),
                summaryQuery.displayStatus(),
                summaryQuery.effectivelyOpen(),
                summaryQuery.applicationMode(),
                summaryQuery.externalFormUrl(),
                summaryQuery.useInterview(),
                summaryQuery.targetRole(),
                TimeMapper.seoulWallClockToInstant(summaryQuery.closedAt())
        );
    }
}
