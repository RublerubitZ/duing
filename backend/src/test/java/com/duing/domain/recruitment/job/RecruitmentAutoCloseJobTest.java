package com.duing.domain.recruitment.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.domain.recruitment.service.RecruitmentAutoCloseService;
import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.JobRunRecorder;
import com.duing.global.jobrun.MonitoredJob;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.slf4j.LoggerFactory;

class RecruitmentAutoCloseJobTest {

    private static final Instant STARTED_AT = Instant.parse("2026-10-29T15:40:00Z");

    private final RecruitmentAutoCloseService recruitmentAutoCloseService = mock(RecruitmentAutoCloseService.class);
    private final JobRunRecorder jobRunRecorder = mock(JobRunRecorder.class);
    private final RecruitmentAutoCloseJob recruitmentAutoCloseJob = new RecruitmentAutoCloseJob(
            recruitmentAutoCloseService, Clock.fixed(STARTED_AT, ZoneId.of("Asia/Seoul")), jobRunRecorder);

    @Test
    @DisplayName("한 모집의 마감이 실패해도 예외를 내보내지 않고 나머지 후보를 순서대로 모두 마감 시도하며, 요약 줄은 실패 수와 함께 WARN 으로 남는다")
    void continuesWithRemainingCandidatesWhenOneFails() {
        when(recruitmentAutoCloseService.findCandidateIds()).thenReturn(List.of(1L, 2L, 3L));
        when(recruitmentAutoCloseService.closeIfSettled(1L)).thenReturn(true);
        when(recruitmentAutoCloseService.closeIfSettled(2L)).thenThrow(new IllegalStateException("잠금 대기 초과"));
        when(recruitmentAutoCloseService.closeIfSettled(3L)).thenReturn(true);

        Logger jobLogger = (Logger) LoggerFactory.getLogger(RecruitmentAutoCloseJob.class);
        ListAppender<ILoggingEvent> logAppender = new ListAppender<>();
        logAppender.start();
        jobLogger.addAppender(logAppender);
        try {
            assertThatCode(recruitmentAutoCloseJob::run).doesNotThrowAnyException();
        } finally {
            jobLogger.detachAppender(logAppender);
        }

        InOrder closeOrder = inOrder(recruitmentAutoCloseService);
        closeOrder.verify(recruitmentAutoCloseService).closeIfSettled(1L);
        closeOrder.verify(recruitmentAutoCloseService).closeIfSettled(2L);
        closeOrder.verify(recruitmentAutoCloseService).closeIfSettled(3L);
        assertThat(logAppender.list).anySatisfy(summaryEvent -> {
            assertThat(summaryEvent.getLevel()).isEqualTo(Level.WARN);
            assertThat(summaryEvent.getFormattedMessage())
                    .isEqualTo("RecruitmentAutoCloseJob done: candidates=3, closed=2, failed=1");
        });
    }

    @Test
    @DisplayName("모두 마감하면 성공과 마감한 모집 수를 기록한다")
    void recordsSuccessWithClosedCount() {
        when(recruitmentAutoCloseService.findCandidateIds()).thenReturn(List.of(1L, 2L, 3L));
        when(recruitmentAutoCloseService.closeIfSettled(1L)).thenReturn(true);
        when(recruitmentAutoCloseService.closeIfSettled(2L)).thenReturn(true);
        when(recruitmentAutoCloseService.closeIfSettled(3L)).thenReturn(false);

        recruitmentAutoCloseJob.run();

        verify(jobRunRecorder).record(MonitoredJob.RECRUITMENT_AUTO_CLOSE, STARTED_AT, JobRunOutcome.SUCCESS, 2, 0);
    }

    @Test
    @DisplayName("한 모집이라도 마감에 실패하면 일부 실패와 실패 수를 기록한다")
    void recordsPartialWhenOneCloseFails() {
        when(recruitmentAutoCloseService.findCandidateIds()).thenReturn(List.of(1L, 2L));
        when(recruitmentAutoCloseService.closeIfSettled(1L)).thenReturn(true);
        when(recruitmentAutoCloseService.closeIfSettled(2L)).thenThrow(new IllegalStateException("잠금 대기 초과"));

        recruitmentAutoCloseJob.run();

        verify(jobRunRecorder).record(MonitoredJob.RECRUITMENT_AUTO_CLOSE, STARTED_AT, JobRunOutcome.PARTIAL, 1, 1);
    }

    @Test
    @DisplayName("후보 조회가 실패하면 실패를 기록하고 같은 예외를 스케줄러로 그대로 내보낸다")
    void recordsFailureAndRethrowsSameException() {
        IllegalStateException candidateFailure = new IllegalStateException("주입된 후보 조회 실패");
        when(recruitmentAutoCloseService.findCandidateIds()).thenThrow(candidateFailure);

        assertThatThrownBy(recruitmentAutoCloseJob::run).isSameAs(candidateFailure);

        verify(jobRunRecorder).record(MonitoredJob.RECRUITMENT_AUTO_CLOSE, STARTED_AT, JobRunOutcome.FAILED, 0, 0);
    }
}
