package com.duing.domain.adminconsole.job;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.duing.domain.adminconsole.service.AdminPendingCountsQueryService;
import com.duing.domain.adminconsole.service.AdminPendingSnapshotRecorder;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AdminPendingSnapshotJobTest {

    /** UTC 2026-10-29 15:01 = KST 2026-10-30 00:01 — 크론이 도는 순간. UTC 날짜로 계산하면 하루 밀린다. */
    private static final Clock SEOUL_CLOCK = Clock.fixed(Instant.parse("2026-10-29T15:01:00Z"), ZoneId.of("Asia/Seoul"));

    @Mock AdminPendingCountsQueryService adminPendingCountsQueryService;
    @Mock AdminPendingSnapshotRecorder adminPendingSnapshotRecorder;

    private TimeZone originalDefaultZone;

    @BeforeEach
    void useUtcJvmZone() {
        originalDefaultZone = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    }

    @AfterEach
    void restoreDefaultZone() {
        TimeZone.setDefault(originalDefaultZone);
    }

    @Test
    @DisplayName("자정 직후 실행되면 JVM 기본 존이 UTC 여도 KST 어제(10/29) 날짜로 그 순간의 대기 건수를 기록한다")
    void recordsSeoulYesterdayUnderUtcJvm() {
        AdminPendingCountsQuery pendingCounts = AdminPendingCountsQuery.of(1, 2, 3, 4, 5, 6, 7, 0);
        when(adminPendingCountsQueryService.getPendingCounts()).thenReturn(pendingCounts);

        new AdminPendingSnapshotJob(adminPendingCountsQueryService, adminPendingSnapshotRecorder, SEOUL_CLOCK).run();

        verify(adminPendingSnapshotRecorder).record(LocalDate.of(2026, 10, 29), pendingCounts);
    }

    @Test
    @DisplayName("대기 건수 계산이 실패하면 기록하지 않고 예외를 스케줄러로 내보낸다 — 그날은 기록 없음으로 남는다")
    void propagatesCountFailureWithoutRecording() {
        when(adminPendingCountsQueryService.getPendingCounts()).thenThrow(new IllegalStateException("집계 실패"));

        AdminPendingSnapshotJob job = new AdminPendingSnapshotJob(adminPendingCountsQueryService, adminPendingSnapshotRecorder, SEOUL_CLOCK);

        assertThatThrownBy(job::run).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(adminPendingSnapshotRecorder);
    }
}
