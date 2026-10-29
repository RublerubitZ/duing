package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.AdminPendingTrendQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "총동연 홈 처리 대기 추이")
public record AdminPendingTrendResponse(
        @Schema(description = "지난 13일(오래된 날부터, 마지막이 KST 어제)의 하루 끝 남은 대기 건수. "
                + "오늘 값은 이 응답에 없다 — pending-counts 의 totalPendingCount 를 쓴다")
        List<DailyPendingTotalResponse> days,

        @Schema(description = "최근 7일 접수·처리 건수")
        RecentFlowResponse recentFlow
) {

    public static AdminPendingTrendResponse from(AdminPendingTrendQuery query) {
        return new AdminPendingTrendResponse(
                query.days().stream().map(DailyPendingTotalResponse::from).toList(),
                RecentFlowResponse.from(query.recentFlow()));
    }
}
