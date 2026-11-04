package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.club.service.dto.query.ClubSignalSummaryQuery;
import com.duing.global.time.TimeMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;

@Schema(description = "총동연 홈 동아리 현황 — 각 수는 GET /admin/clubs?status=ACTIVE&signal=… 의 totalElements 와 같은 식(같은 순간 기준)")
public record AdminClubSignalsResponse(
        @Schema(description = "운영 중(ACTIVE) 동아리 수 — ?status=ACTIVE totalElements", example = "165")
        long activeClubCount,

        @Schema(description = "지원 결과 미확정(signal=RESULT_WAITING)")
        ResultWaitingSummary resultWaiting,

        @Schema(description = "가입 신청 7일 넘게 대기(signal=JOIN_REQUEST_WAITING)")
        JoinRequestWaitingSummary joinRequestWaiting,

        @Schema(description = "두잉 기록 없음(signal=NO_RECORD) 동아리 수", example = "110")
        long noRecordClubCount,

        @Schema(description = "운영진 30일 넘게 미접속(signal=OPERATOR_INACTIVE) 동아리 수", example = "119")
        long operatorInactiveClubCount
) {

    @Schema(description = "지원 결과 미확정 묶음 — 세 값은 한 문장에서 나온다")
    public record ResultWaitingSummary(
            @Schema(description = "신호 동아리 수", example = "6") long clubCount,
            @Schema(description = "신호 모집들의 결과 미확정 지원 합(지원서 단위)", example = "15") long applicationCount,
            @Schema(description = "신호 모집 중 가장 이른 끝난 날(KST 날짜). clubCount 가 0 일 때만, 그리고 그때 반드시 null",
                    nullable = true, example = "2026-07-25")
            LocalDate oldestEndedOn
    ) {
    }

    @Schema(description = "가입 신청 7일 넘게 대기 묶음 — 세 값은 한 문장에서 나온다")
    public record JoinRequestWaitingSummary(
            @Schema(description = "신호 동아리 수", example = "1") long clubCount,
            @Schema(description = "신호 동아리의 대기 신청 전부(7일 안 신청 포함)", example = "1") long requestCount,
            @Schema(description = "가장 오래된 대기 신청 시각(ISO Instant). clubCount 가 0 일 때만, 그리고 그때 반드시 null", nullable = true)
            Instant oldestRequestedAt
    ) {
    }

    public static AdminClubSignalsResponse from(ClubSignalSummaryQuery summaryQuery) {
        ClubSignalSummaryQuery.ResultWaiting resultWaiting = summaryQuery.resultWaiting();
        ClubSignalSummaryQuery.JoinRequestWaiting joinRequestWaiting = summaryQuery.joinRequestWaiting();
        return new AdminClubSignalsResponse(
                summaryQuery.activeClubCount(),
                new ResultWaitingSummary(resultWaiting.clubCount(), resultWaiting.applicationCount(), resultWaiting.oldestEndedOn()),
                new JoinRequestWaitingSummary(joinRequestWaiting.clubCount(), joinRequestWaiting.requestCount(),
                        TimeMapper.systemWallClockToInstant(joinRequestWaiting.oldestRequestedAt())),
                summaryQuery.noRecordClubCount(),
                summaryQuery.operatorInactiveClubCount());
    }
}
