package com.duing.global.jobrun;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.global.jobrun.entity.ScheduledJobRun;
import com.duing.global.jobrun.repository.ScheduledJobRunRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JobRunRecorderTest extends IntegrationTestBase {

    @Autowired JobRunRecorder jobRunRecorder;
    @Autowired ScheduledJobRunRepository scheduledJobRunRepository;
    @Autowired PlatformTransactionManager platformTransactionManager;
    @Autowired Clock clock;

    /** DB 는 마이크로초까지 저장한다 — 비교할 시작 시각을 미리 잘라 둔다. */
    private Instant startedNow() {
        return Instant.now(clock).truncatedTo(ChronoUnit.MICROS);
    }

    private ScheduledJobRun runOf(MonitoredJob job) {
        return scheduledJobRunRepository.findById(job.name()).orElseThrow();
    }

    @Test
    @DisplayName("첫 기록은 작업 한 줄을 만들고 결과·건수·마지막 성공 시각을 남긴다")
    void createsRowOnFirstRecord() {
        Instant startedAt = startedNow();

        jobRunRecorder.record(MonitoredJob.RECRUITMENT_AUTO_CLOSE, startedAt, JobRunOutcome.SUCCESS, 2, 0);

        ScheduledJobRun run = runOf(MonitoredJob.RECRUITMENT_AUTO_CLOSE);
        assertThat(run.getLastStartedAt()).isEqualTo(startedAt);
        assertThat(run.getLastFinishedAt()).isAfterOrEqualTo(startedAt);
        assertThat(run.getLastOutcome()).isEqualTo(JobRunOutcome.SUCCESS);
        assertThat(run.getLastResultCount()).isEqualTo(2);
        assertThat(run.getLastFailedCount()).isZero();
        assertThat(run.getLastSucceededAt()).isEqualTo(run.getLastFinishedAt());
        assertThat(run.getConsecutiveUnhealthyRuns()).isZero();
    }

    @Test
    @DisplayName("다시 기록하면 같은 줄을 덮어쓰고, 실패는 마지막 성공 시각을 지우지 않으며 연속 실패 수는 성공에서만 0 이 된다")
    void overwritesSameRowAndCountsConsecutiveUnhealthyRuns() {
        jobRunRecorder.record(MonitoredJob.FACILITY_RESERVATION_CRAWL, startedNow(), JobRunOutcome.SUCCESS, 10, 0);
        Instant firstSucceededAt = runOf(MonitoredJob.FACILITY_RESERVATION_CRAWL).getLastSucceededAt();

        jobRunRecorder.record(MonitoredJob.FACILITY_RESERVATION_CRAWL, startedNow(), JobRunOutcome.FAILED, 0, 0);
        ScheduledJobRun afterFailure = runOf(MonitoredJob.FACILITY_RESERVATION_CRAWL);
        assertThat(afterFailure.getLastOutcome()).isEqualTo(JobRunOutcome.FAILED);
        assertThat(afterFailure.getLastSucceededAt()).isEqualTo(firstSucceededAt);
        assertThat(afterFailure.getConsecutiveUnhealthyRuns()).isEqualTo(1);

        jobRunRecorder.record(MonitoredJob.FACILITY_RESERVATION_CRAWL, startedNow(), JobRunOutcome.PARTIAL, 9, 1);
        ScheduledJobRun afterPartial = runOf(MonitoredJob.FACILITY_RESERVATION_CRAWL);
        assertThat(afterPartial.getLastSucceededAt()).isEqualTo(afterPartial.getLastFinishedAt());
        assertThat(afterPartial.getLastFailedCount()).isEqualTo(1);
        assertThat(afterPartial.getConsecutiveUnhealthyRuns()).isEqualTo(2);

        jobRunRecorder.record(MonitoredJob.FACILITY_RESERVATION_CRAWL, startedNow(), JobRunOutcome.SUCCESS, 10, 0);
        assertThat(runOf(MonitoredJob.FACILITY_RESERVATION_CRAWL).getConsecutiveUnhealthyRuns()).isZero();
        assertThat(scheduledJobRunRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("바깥이 읽기 전용 트랜잭션이어도 기록이 남는다 — 리마인더 잡의 run() 처럼")
    void recordsInsideReadOnlyOuterTransaction() {
        TransactionTemplate readOnlyOuter = new TransactionTemplate(platformTransactionManager);
        readOnlyOuter.setReadOnly(true);

        readOnlyOuter.executeWithoutResult(status -> jobRunRecorder.record(
                MonitoredJob.APPLICATION_PENDING_REMINDER, startedNow(), JobRunOutcome.SUCCESS, 3, 0));

        assertThat(runOf(MonitoredJob.APPLICATION_PENDING_REMINDER).getLastResultCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("바깥 트랜잭션이 롤백돼도 기록은 남는다 — 잡이 실패해도 실패 기록이 사라지지 않는다")
    void keepsRecordWhenOuterTransactionRollsBack() {
        TransactionTemplate outer = new TransactionTemplate(platformTransactionManager);

        outer.executeWithoutResult(status -> {
            jobRunRecorder.record(MonitoredJob.FEDERATION_INQUIRY_PURGE, startedNow(), JobRunOutcome.FAILED, 0, 0);
            status.setRollbackOnly();
        });

        assertThat(runOf(MonitoredJob.FEDERATION_INQUIRY_PURGE).getLastOutcome()).isEqualTo(JobRunOutcome.FAILED);
    }
}
