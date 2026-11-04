package com.duing.domain.adminconsole.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

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
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;

@ExtendWith(MockitoExtension.class)
class AdminJobStatusQueryServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-30T03:00:00Z");
    private static final Clock SEOUL_CLOCK = Clock.fixed(NOW, ZoneId.of("Asia/Seoul"));
    /** 기동한 지 사흘 — 어떤 작업에도 기동 유예가 남지 않는다. */
    private static final Instant BOOTED_LONG_AGO = NOW.minus(Duration.ofDays(3));

    @Mock ScheduledJobRunRepository scheduledJobRunRepository;
    @Mock Environment environment;
    @Mock ApplicationContext applicationContext;

    private AdminJobStatusQueryService serviceBootedAt(Instant bootedAt) {
        lenient().when(applicationContext.getStartupDate()).thenReturn(bootedAt.toEpochMilli());
        return new AdminJobStatusQueryService(scheduledJobRunRepository, environment, applicationContext, SEOUL_CLOCK);
    }

    private void enableAllJobs() {
        for (MonitoredJob job : MonitoredJob.values()) {
            lenient().when(environment.getProperty(job.getEnabledProperty())).thenReturn("true");
        }
    }

    private void givenRuns(ScheduledJobRun... runs) {
        when(scheduledJobRunRepository.findAllById(anyIterable())).thenReturn(List.of(runs));
    }

    /** 기록 한 줄 — 엔티티는 조회 전용(생성자 없음)이라 목으로 만든다. */
    private static ScheduledJobRun runOf(MonitoredJob job, Duration finishedAgo, JobRunOutcome outcome,
                                         int consecutiveUnhealthyRuns) {
        ScheduledJobRun run = mock(ScheduledJobRun.class, withSettings().strictness(Strictness.LENIENT));
        Instant finishedAt = NOW.minus(finishedAgo);
        when(run.getJobKey()).thenReturn(job.name());
        when(run.getLastStartedAt()).thenReturn(finishedAt.minusSeconds(5));
        when(run.getLastFinishedAt()).thenReturn(finishedAt);
        when(run.getLastOutcome()).thenReturn(outcome);
        when(run.getLastResultCount()).thenReturn(2);
        when(run.getLastFailedCount()).thenReturn(outcome == JobRunOutcome.SUCCESS ? 0 : 1);
        when(run.getLastSucceededAt()).thenReturn(outcome == JobRunOutcome.FAILED ? null : finishedAt);
        when(run.getConsecutiveUnhealthyRuns()).thenReturn(consecutiveUnhealthyRuns);
        return run;
    }

    private static JobStatusQuery statusOf(AdminJobStatusQuery result, MonitoredJob job) {
        return result.jobs().stream().filter(status -> status.job() == job).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("작업 다섯 개를 선언 순서대로 주고, 기록이 없는 작업도 줄을 빠뜨리지 않는다")
    void returnsEveryJobInDeclarationOrder() {
        enableAllJobs();
        // 실패한 기록은 마지막 성공 시각이 마지막 종료 시각과 다르다 — 두 값이 섞이지 않고 그대로 나가는지 본다
        ScheduledJobRun failedPurge = runOf(MonitoredJob.FEDERATION_INQUIRY_PURGE, Duration.ofHours(2), JobRunOutcome.FAILED, 1);
        when(failedPurge.getLastSucceededAt()).thenReturn(NOW.minus(Duration.ofHours(30)));
        givenRuns(runOf(MonitoredJob.FACILITY_RESERVATION_CRAWL, Duration.ofMinutes(5), JobRunOutcome.SUCCESS, 0), failedPurge);

        AdminJobStatusQuery result = serviceBootedAt(BOOTED_LONG_AGO).getJobStatuses();

        assertThat(result.jobs()).extracting(JobStatusQuery::job).containsExactly(MonitoredJob.values());
        JobStatusQuery autoClose = statusOf(result, MonitoredJob.RECRUITMENT_AUTO_CLOSE);
        assertThat(autoClose.lastFinishedAt()).isNull();
        assertThat(autoClose.lastSucceededAt()).isNull();
        assertThat(autoClose.lastOutcome()).isNull();
        assertThat(autoClose.resultCount()).isNull();
        assertThat(autoClose.failedCount()).isNull();
        JobStatusQuery purge = statusOf(result, MonitoredJob.FEDERATION_INQUIRY_PURGE);
        assertThat(purge.lastFinishedAt()).isEqualTo(NOW.minus(Duration.ofHours(2)));
        assertThat(purge.lastSucceededAt()).isEqualTo(NOW.minus(Duration.ofHours(30)));
        JobStatusQuery crawl = statusOf(result, MonitoredJob.FACILITY_RESERVATION_CRAWL);
        assertThat(crawl.health()).isEqualTo(JobHealth.OK);
        assertThat(crawl.lastFinishedAt()).isEqualTo(NOW.minus(Duration.ofMinutes(5)));
        assertThat(crawl.lastSucceededAt()).isEqualTo(NOW.minus(Duration.ofMinutes(5)));
        assertThat(crawl.lastOutcome()).isEqualTo(JobRunOutcome.SUCCESS);
        assertThat(crawl.resultCount()).isEqualTo(2);
        assertThat(crawl.failedCount()).isZero();
    }

    @Test
    @DisplayName("켜는 설정 값이 \"true\"(대소문자 무시)가 아니면 기록과 무관하게 꺼짐이다 — 값 없음·false·on 은 꺼짐, TRUE 는 켜짐")
    void disabledUnlessPropertyIsTrueIgnoringCase() {
        lenient().when(environment.getProperty(MonitoredJob.RECRUITMENT_AUTO_CLOSE.getEnabledProperty())).thenReturn(null);
        lenient().when(environment.getProperty(MonitoredJob.APPLICATION_PENDING_REMINDER.getEnabledProperty())).thenReturn("false");
        lenient().when(environment.getProperty(MonitoredJob.FACILITY_RESERVATION_CRAWL.getEnabledProperty())).thenReturn("on");
        lenient().when(environment.getProperty(MonitoredJob.FACILITY_BOOKING_MATCHING.getEnabledProperty())).thenReturn("TRUE");
        lenient().when(environment.getProperty(MonitoredJob.FEDERATION_INQUIRY_PURGE.getEnabledProperty())).thenReturn("true");
        // 꺼진 작업에 오래된 실패 기록이 남아 있어도(끄기 전 기록) 꺼짐이 먼저다
        givenRuns(runOf(MonitoredJob.RECRUITMENT_AUTO_CLOSE, Duration.ofDays(5), JobRunOutcome.FAILED, 4),
                runOf(MonitoredJob.FACILITY_BOOKING_MATCHING, Duration.ofMinutes(4), JobRunOutcome.SUCCESS, 0),
                runOf(MonitoredJob.FEDERATION_INQUIRY_PURGE, Duration.ofHours(3), JobRunOutcome.SUCCESS, 0));

        AdminJobStatusQuery result = serviceBootedAt(BOOTED_LONG_AGO).getJobStatuses();

        assertThat(statusOf(result, MonitoredJob.RECRUITMENT_AUTO_CLOSE).health()).isEqualTo(JobHealth.DISABLED);
        assertThat(statusOf(result, MonitoredJob.APPLICATION_PENDING_REMINDER).health()).isEqualTo(JobHealth.DISABLED);
        assertThat(statusOf(result, MonitoredJob.FACILITY_RESERVATION_CRAWL).health()).isEqualTo(JobHealth.DISABLED);
        assertThat(statusOf(result, MonitoredJob.FACILITY_BOOKING_MATCHING).health()).isEqualTo(JobHealth.OK);
        assertThat(statusOf(result, MonitoredJob.FEDERATION_INQUIRY_PURGE).health()).isEqualTo(JobHealth.OK);
    }

    @Test
    @DisplayName("기록이 없으면 서버 기동 뒤 maxGap 안에서는 첫 실행 전, 지나면 늦음이다 — 매일 잡 26시간·10분 잡 30분")
    void noRecordIsNotYetWithinBootGraceThenOverdue() {
        enableAllJobs();
        givenRuns();

        AdminJobStatusQuery bootedTwentyFiveHoursAgo = serviceBootedAt(NOW.minus(Duration.ofHours(25))).getJobStatuses();
        assertThat(statusOf(bootedTwentyFiveHoursAgo, MonitoredJob.RECRUITMENT_AUTO_CLOSE).health()).isEqualTo(JobHealth.NOT_YET);
        assertThat(statusOf(bootedTwentyFiveHoursAgo, MonitoredJob.FACILITY_RESERVATION_CRAWL).health()).isEqualTo(JobHealth.OVERDUE);

        AdminJobStatusQuery bootedTwentyNineMinutesAgo = serviceBootedAt(NOW.minus(Duration.ofMinutes(29))).getJobStatuses();
        assertThat(statusOf(bootedTwentyNineMinutesAgo, MonitoredJob.FACILITY_RESERVATION_CRAWL).health()).isEqualTo(JobHealth.NOT_YET);

        AdminJobStatusQuery bootedLongAgo = serviceBootedAt(BOOTED_LONG_AGO).getJobStatuses();
        assertThat(statusOf(bootedLongAgo, MonitoredJob.FEDERATION_INQUIRY_PURGE).health()).isEqualTo(JobHealth.OVERDUE);
    }

    @Test
    @DisplayName("마지막 종료가 maxGap 을 넘으면 늦음이고, 정확히 같으면 늦음이 아니다 — 재배포 뒤에도 기동 유예 없이 기록으로 판정한다")
    void overdueOnlyAfterMaxGapEvenRightAfterRedeploy() {
        enableAllJobs();
        givenRuns(runOf(MonitoredJob.RECRUITMENT_AUTO_CLOSE, Duration.ofHours(26), JobRunOutcome.SUCCESS, 0),
                runOf(MonitoredJob.APPLICATION_PENDING_REMINDER, Duration.ofHours(26).plusSeconds(1), JobRunOutcome.SUCCESS, 0),
                runOf(MonitoredJob.FACILITY_RESERVATION_CRAWL, Duration.ofMinutes(31), JobRunOutcome.SUCCESS, 0),
                // 늦음이 연속 실패보다 먼저다 — 오래 멈춘 작업의 마지막 결과가 실패여도 늦음으로 보인다
                runOf(MonitoredJob.FEDERATION_INQUIRY_PURGE, Duration.ofHours(27), JobRunOutcome.FAILED, 2));

        // 방금 재배포했다(기동 1분) — 기록이 있는 작업은 기동 유예를 받지 않는다
        AdminJobStatusQuery result = serviceBootedAt(NOW.minus(Duration.ofMinutes(1))).getJobStatuses();

        assertThat(statusOf(result, MonitoredJob.RECRUITMENT_AUTO_CLOSE).health()).isEqualTo(JobHealth.OK);
        assertThat(statusOf(result, MonitoredJob.APPLICATION_PENDING_REMINDER).health()).isEqualTo(JobHealth.OVERDUE);
        assertThat(statusOf(result, MonitoredJob.FACILITY_RESERVATION_CRAWL).health()).isEqualTo(JobHealth.OVERDUE);
        assertThat(statusOf(result, MonitoredJob.FEDERATION_INQUIRY_PURGE).health()).isEqualTo(JobHealth.OVERDUE);
    }

    @Test
    @DisplayName("매일 잡은 한 번의 실패·일부 실패도 경고하고, 10분 잡은 3회 연속일 때만 경고한다")
    void warnsAfterConsecutiveUnhealthyRunsPerCadence() {
        enableAllJobs();
        givenRuns(runOf(MonitoredJob.RECRUITMENT_AUTO_CLOSE, Duration.ofHours(2), JobRunOutcome.FAILED, 1),
                runOf(MonitoredJob.APPLICATION_PENDING_REMINDER, Duration.ofHours(2), JobRunOutcome.PARTIAL, 1),
                runOf(MonitoredJob.FACILITY_RESERVATION_CRAWL, Duration.ofMinutes(2), JobRunOutcome.FAILED, 2),
                runOf(MonitoredJob.FACILITY_BOOKING_MATCHING, Duration.ofMinutes(2), JobRunOutcome.PARTIAL, 3),
                runOf(MonitoredJob.FEDERATION_INQUIRY_PURGE, Duration.ofHours(2), JobRunOutcome.SUCCESS, 0));

        AdminJobStatusQuery result = serviceBootedAt(BOOTED_LONG_AGO).getJobStatuses();

        assertThat(statusOf(result, MonitoredJob.RECRUITMENT_AUTO_CLOSE).health()).isEqualTo(JobHealth.FAILED);
        assertThat(statusOf(result, MonitoredJob.APPLICATION_PENDING_REMINDER).health()).isEqualTo(JobHealth.PARTIAL);
        assertThat(statusOf(result, MonitoredJob.FACILITY_RESERVATION_CRAWL).health()).isEqualTo(JobHealth.OK);
        assertThat(statusOf(result, MonitoredJob.FACILITY_BOOKING_MATCHING).health()).isEqualTo(JobHealth.PARTIAL);
        assertThat(statusOf(result, MonitoredJob.FEDERATION_INQUIRY_PURGE).health()).isEqualTo(JobHealth.OK);
    }

    @Test
    @DisplayName("기록을 읽을 때는 아는 작업 키만 묻는다 — 모르는 키 줄이 있어도 매핑이 깨지지 않는다")
    void queriesOnlyKnownJobKeys() {
        enableAllJobs();
        when(scheduledJobRunRepository.findAllById(Arrays.stream(MonitoredJob.values()).map(MonitoredJob::name).toList()))
                .thenReturn(List.of());

        AdminJobStatusQuery result = serviceBootedAt(BOOTED_LONG_AGO).getJobStatuses();

        assertThat(result.jobs()).hasSize(MonitoredJob.values().length);
    }
}
