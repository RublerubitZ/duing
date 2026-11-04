package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.JobHealth;
import com.duing.domain.adminconsole.service.dto.query.JobStatusQuery;
import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.MonitoredJob;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

@Schema(description = "자동 작업 한 줄")
public record JobStatusResponse(
        @Schema(description = "작업 키 — 선언 순서가 화면 순서", example = "RECRUITMENT_AUTO_CLOSE")
        MonitoredJob job,
        @Schema(description = "화면 상태 — OK·PARTIAL·FAILED·OVERDUE(늦음)·NOT_YET(첫 실행 전)·DISABLED(꺼짐)", example = "OK")
        JobHealth health,
        @Schema(description = "마지막 종료 시각. 기록 없으면 null", nullable = true)
        Instant lastFinishedAt,
        @Schema(description = "실패가 아니었던 마지막 종료 시각(일부 실패 포함). 없으면 null", nullable = true)
        Instant lastSucceededAt,
        @Schema(description = "마지막 실행 결과 SUCCESS·PARTIAL·FAILED. 기록 없으면 null", nullable = true)
        JobRunOutcome lastOutcome,
        @Schema(description = "마지막 실행 결과 건수(작업마다 뜻이 다르다 — 마감 모집 수·알림 수 등). 기록 없으면 null", nullable = true)
        Integer resultCount,
        @Schema(description = "마지막 실행 실패 건수. 기록 없으면 null", nullable = true)
        Integer failedCount
) {
    public static JobStatusResponse from(JobStatusQuery query) {
        return new JobStatusResponse(query.job(), query.health(), query.lastFinishedAt(), query.lastSucceededAt(),
                query.lastOutcome(), query.resultCount(), query.failedCount());
    }
}
