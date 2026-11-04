package com.duing.domain.adminconsole.service;

import com.duing.domain.adminconsole.service.dto.query.AdminJobStatusQuery;
import com.duing.domain.adminconsole.service.dto.query.JobHealth;
import com.duing.domain.adminconsole.service.dto.query.JobStatusQuery;
import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.MonitoredJob;
import com.duing.global.jobrun.entity.ScheduledJobRun;
import com.duing.global.jobrun.repository.ScheduledJobRunRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연 홈 자동 작업 상태 — 작업마다 최근 실행 기록·켜는 설정·서버 기동 시각으로 화면 상태를 판정한다(스펙 §3-3).
 *
 * <p>판정 순서: 꺼짐 → 기록 없음(기동 뒤 maxGap 안 = 첫 실행 전, 밖 = 늦음) → 마지막 종료가 maxGap 초과 = 늦음 →
 * 마지막 결과가 실패·일부 실패이고 연속 수가 warnAfterRuns 이상 = 그 상태 → 정상.
 * 꺼짐은 {@code @ConditionalOnProperty(havingValue = "true")} 와 같은 기준으로 본다 — {@code getProperty(name, Boolean.class)} 는
 * "on"·"yes" 도 참으로 읽어, 잡은 등록되지 않았는데 "늦음"이 되는 어긋남이 생긴다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminJobStatusQueryService {

    private final ScheduledJobRunRepository scheduledJobRunRepository;
    private final Environment environment;
    private final ApplicationContext applicationContext;
    private final Clock clock;

    public AdminJobStatusQuery getJobStatuses() {
        Instant now = Instant.now(clock);
        Instant bootedAt = Instant.ofEpochMilli(applicationContext.getStartupDate());
        // 아는 키만 묻는다 — 나중 이미지가 남긴 모르는 키 줄은 읽지 않는다(롤백 대비).
        Map<String, ScheduledJobRun> runsByJobKey = scheduledJobRunRepository
                .findAllById(Arrays.stream(MonitoredJob.values()).map(MonitoredJob::name).toList()).stream()
                .collect(Collectors.toMap(ScheduledJobRun::getJobKey, Function.identity()));
        return new AdminJobStatusQuery(Arrays.stream(MonitoredJob.values())
                .map(job -> toStatus(job, runsByJobKey.get(job.name()), now, bootedAt))
                .toList());
    }

    private JobStatusQuery toStatus(MonitoredJob job, ScheduledJobRun run, Instant now, Instant bootedAt) {
        JobHealth health = judge(job, run, now, bootedAt);
        if (run == null) {
            return JobStatusQuery.withoutRun(job, health);
        }
        return new JobStatusQuery(job, health, run.getLastFinishedAt(), run.getLastSucceededAt(),
                run.getLastOutcome(), run.getLastResultCount(), run.getLastFailedCount());
    }

    private JobHealth judge(MonitoredJob job, ScheduledJobRun run, Instant now, Instant bootedAt) {
        // 문의 파기 잡만 빈이 조건 없이 등록되고 실제 문이 properties.enabled()(Boot boolean 바인딩 — "on"·"yes" 도 참)라,
        // 값이 "on" 이면 카드는 꺼짐인데 잡은 돌 수 있다(운영 값은 true/false 라 실제로는 생기지 않는다).
        if (!"true".equalsIgnoreCase(environment.getProperty(job.getEnabledProperty()))) {
            return JobHealth.DISABLED;
        }
        if (run == null) {
            return isLongerThanMaxGap(job, bootedAt, now) ? JobHealth.OVERDUE : JobHealth.NOT_YET;
        }
        if (isLongerThanMaxGap(job, run.getLastFinishedAt(), now)) {
            return JobHealth.OVERDUE;
        }
        if (run.getLastOutcome() != JobRunOutcome.SUCCESS
                && run.getConsecutiveUnhealthyRuns() >= job.getWarnAfterRuns()) {
            return run.getLastOutcome() == JobRunOutcome.FAILED ? JobHealth.FAILED : JobHealth.PARTIAL;
        }
        return JobHealth.OK;
    }

    private static boolean isLongerThanMaxGap(MonitoredJob job, Instant since, Instant now) {
        return Duration.between(since, now).compareTo(job.getMaxGap()) > 0;
    }
}
