package com.duing.domain.adminconsole.service.dto.query;

import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.MonitoredJob;
import java.time.Instant;

/** 자동 작업 한 줄. 기록이 없으면 health 를 뺀 다섯 값이 null 이다. */
public record JobStatusQuery(
        MonitoredJob job,
        JobHealth health,
        Instant lastFinishedAt,
        Instant lastSucceededAt,
        JobRunOutcome lastOutcome,
        Integer resultCount,
        Integer failedCount
) {
    public static JobStatusQuery withoutRun(MonitoredJob job, JobHealth health) {
        return new JobStatusQuery(job, health, null, null, null, null, null);
    }
}
