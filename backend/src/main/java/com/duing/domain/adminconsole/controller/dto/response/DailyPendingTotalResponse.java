package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.DailyPendingTotalQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

@Schema(description = "하루치 남은 대기 건수")
public record DailyPendingTotalResponse(
        @Schema(description = "KST 날짜", example = "2026-10-28")
        LocalDate date,

        @Schema(description = "그날 하루 끝(다음 날 00:01 KST) 남은 대기 건수 합계 — pending-counts 의 totalPendingCount 와 같은 정의. "
                + "기록이 없는 날은 null(0 과 다르다)", example = "18", nullable = true)
        Integer totalPendingCount
) {

    public static DailyPendingTotalResponse from(DailyPendingTotalQuery query) {
        return new DailyPendingTotalResponse(query.date(), query.totalPendingCount());
    }
}
