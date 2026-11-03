package com.duing.domain.recruitment.stats.controller.dto.response;

import com.duing.domain.recruitment.controller.dto.response.AutoCloseOutlookResponse;
import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;
import com.duing.global.time.TimeMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

public record StatsSummaryResponse(
        long total,
        long submitted,
        long onHold,
        long interviewPending,
        long accepted,
        long rejected,
        int capacity,
        double ratio,
        Instant oldestPendingSubmittedAt,
        @Schema(description = "지금 이 모집을 삭제할 수 있는지 — 서버 삭제 가드와 같은 판정(마감됨·지원서 0건·처리되지 않은 가입 요청 없음). "
                + "지원서는 탈퇴한 지원자의 것도 이력이라 세므로, 건수가 0 이어도 false 일 수 있다.", example = "false")
        boolean deletable,
        @Schema(description = "자동 마감 전망 — 기간이 끝났지만 아직 OPEN 인 모집에만 있다. 마감됨·상시모집·기간 중이거나 "
                + "자동 마감이 꺼져 있으면 null 이다(#1572).", nullable = true)
        AutoCloseOutlookResponse autoClose
) {

    public static StatsSummaryResponse from(StatsSummaryQuery statsSummaryQuery) {
        return new StatsSummaryResponse(
                statsSummaryQuery.total(),
                statsSummaryQuery.submitted(),
                statsSummaryQuery.onHold(),
                statsSummaryQuery.interviewPending(),
                statsSummaryQuery.accepted(),
                statsSummaryQuery.rejected(),
                statsSummaryQuery.capacity(),
                statsSummaryQuery.ratio(),
                TimeMapper.systemWallClockToInstant(statsSummaryQuery.oldestPendingSubmittedAt()),
                statsSummaryQuery.deletable(),
                AutoCloseOutlookResponse.from(statsSummaryQuery.autoClose())
        );
    }
}
