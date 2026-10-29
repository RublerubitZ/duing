package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.RecentFlowQuery;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "최근 접수·처리 건수 — 신고·문의·시설 예약·홍보·회장 승계 5개 영역 합(동아리 승인·모집 제외)")
public record RecentFlowResponse(
        @Schema(description = "센 기간(일, 지금부터 거꾸로 롤링)", example = "7")
        int days,

        @Schema(description = "기간 안에 들어온 건수", example = "31")
        long receivedCount,

        @Schema(description = "기간 안에 처리(해결·기각·답변·닫음·승인·반려·수락)된 건수", example = "27")
        long handledCount
) {

    public static RecentFlowResponse from(RecentFlowQuery query) {
        return new RecentFlowResponse(query.days(), query.receivedCount(), query.handledCount());
    }
}
