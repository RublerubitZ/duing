package com.duing.global.jobrun;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.global.jobrun.repository.ScheduledJobRunRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.SimpleTransactionStatus;

/** 기록 실패가 잡으로 번지지 않는지 — 저장 예외와 커밋 단계 예외 둘 다(트랜잭션 매니저를 목으로 둔다). */
class JobRunRecorderFailureTest {

    private static final Instant NOW = Instant.parse("2026-10-30T03:00:00Z");

    private final ScheduledJobRunRepository scheduledJobRunRepository = mock(ScheduledJobRunRepository.class);
    private final PlatformTransactionManager platformTransactionManager = mock(PlatformTransactionManager.class);
    private final JobRunRecorder jobRunRecorder = new JobRunRecorder(
            scheduledJobRunRepository, Clock.fixed(NOW, ZoneId.of("Asia/Seoul")), platformTransactionManager);

    private final Logger recorderLogger = (Logger) LoggerFactory.getLogger(JobRunRecorder.class);
    private final ListAppender<ILoggingEvent> logAppender = new ListAppender<>();

    @BeforeEach
    void setUp() {
        when(platformTransactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        logAppender.start();
        recorderLogger.addAppender(logAppender);
    }

    @AfterEach
    void tearDown() {
        recorderLogger.detachAppender(logAppender);
    }

    @Test
    @DisplayName("저장 중 예외를 삼키고 WARN 한 줄만 남긴다 — 기록 장치 때문에 잡이 실패하지 않는다")
    void swallowsRepositoryFailureWithWarnLog() {
        when(scheduledJobRunRepository.upsert(anyString(), any(), any(), anyString(), anyInt(), anyInt()))
                .thenThrow(new DataIntegrityViolationException("주입된 저장 실패"));

        assertThatCode(() -> jobRunRecorder.record(MonitoredJob.RECRUITMENT_AUTO_CLOSE, NOW, JobRunOutcome.SUCCESS, 1, 0))
                .doesNotThrowAnyException();

        assertThat(logAppender.list).anySatisfy(warnEvent -> {
            assertThat(warnEvent.getLevel()).isEqualTo(Level.WARN);
            assertThat(warnEvent.getFormattedMessage()).isEqualTo("JobRunRecorder: 기록 실패 job=RECRUITMENT_AUTO_CLOSE");
        });
    }

    @Test
    @DisplayName("커밋 단계에서 나는 실패도 삼킨다 — try 가 트랜잭션 경계 바깥에 있다")
    void swallowsCommitFailure() {
        doThrow(new TransactionSystemException("주입된 커밋 실패")).when(platformTransactionManager).commit(any());

        assertThatCode(() -> jobRunRecorder.record(MonitoredJob.FACILITY_BOOKING_MATCHING, NOW, JobRunOutcome.SUCCESS, 0, 0))
                .doesNotThrowAnyException();

        verify(scheduledJobRunRepository).upsert("FACILITY_BOOKING_MATCHING", NOW, NOW, "SUCCESS", 0, 0);
        assertThat(logAppender.list).anySatisfy(warnEvent -> assertThat(warnEvent.getLevel()).isEqualTo(Level.WARN));
    }
}
