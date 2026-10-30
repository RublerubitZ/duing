package com.duing.domain.facilitybooking.scheduler;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityPolicy;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService;
import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.JobRunRecorder;
import com.duing.global.jobrun.MonitoredJob;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** runScheduled 의 실패 기록 경로 — 사이클 안의 예외는 통합 테스트로 만들기 어려워 의존을 목으로 둔다. */
class FacilityBookingMatchingSchedulerRecordTest {

    private static final Instant NOW = Instant.parse("2026-10-30T03:03:00Z");

    private final FacilityAvailabilityPolicy availabilityPolicy = mock(FacilityAvailabilityPolicy.class);
    private final JobRunRecorder jobRunRecorder = mock(JobRunRecorder.class);
    private final FacilityBookingMatchingScheduler scheduler = new FacilityBookingMatchingScheduler(
            mock(FacilityBookingRepository.class), mock(FacilityMonthSnapshotRepository.class),
            mock(FacilityBookingMatchingService.class), availabilityPolicy, mock(ClubRepository.class),
            Clock.fixed(NOW, ZoneId.of("Asia/Seoul")), jobRunRecorder);

    @Test
    @DisplayName("사이클 중 예외가 나면 실패를 기록하고 같은 예외를 그대로 내보낸다")
    void recordsFailureAndRethrowsSameException() {
        IllegalStateException policyFailure = new IllegalStateException("주입된 정책 조회 실패");
        when(availabilityPolicy.collidingClubKeys()).thenThrow(policyFailure);

        assertThatThrownBy(scheduler::runScheduled).isSameAs(policyFailure);

        verify(jobRunRecorder).record(MonitoredJob.FACILITY_BOOKING_MATCHING, NOW, JobRunOutcome.FAILED, 0, 0);
    }
}
