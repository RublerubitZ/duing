package com.duing.domain.recruitment.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.domain.recruitment.service.RecruitmentAutoCloseService;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.slf4j.LoggerFactory;

class RecruitmentAutoCloseJobTest {

    private final RecruitmentAutoCloseService recruitmentAutoCloseService = mock(RecruitmentAutoCloseService.class);
    private final RecruitmentAutoCloseJob recruitmentAutoCloseJob =
            new RecruitmentAutoCloseJob(recruitmentAutoCloseService);

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
}
