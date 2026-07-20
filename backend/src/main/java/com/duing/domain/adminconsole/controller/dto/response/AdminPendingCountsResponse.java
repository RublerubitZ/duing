package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "총동연 관리자 콘솔 미처리 건수")
public record AdminPendingCountsResponse(
        @Schema(description = "승인 대기 동아리 수", example = "12")
        long clubApproval,

        @Schema(description = "조치가 필요한 시설 예약 수(승인 대기 + 충돌)", example = "3")
        long facilityBooking,

        @Schema(description = "답변이 나가지 않은 1:1 문의 수(접수 + 처리 중)", example = "7")
        long inquiryUnanswered,

        @Schema(description = "검토 대기 홍보 요청 수", example = "2")
        long promotionRequest,

        @Schema(description = "미처리 신고 수", example = "5")
        long reportUnresolved,

        @Schema(description = "대기 중인 회장 승계 요청 수", example = "1")
        long leaderSuccession,

        @Schema(description = "위 항목의 총합", example = "30")
        long totalPendingCount
) {

    public static AdminPendingCountsResponse from(AdminPendingCountsQuery query) {
        return new AdminPendingCountsResponse(
                query.clubApproval(),
                query.facilityBooking(),
                query.inquiryUnanswered(),
                query.promotionRequest(),
                query.reportUnresolved(),
                query.leaderSuccession(),
                query.totalPendingCount()
        );
    }
}
