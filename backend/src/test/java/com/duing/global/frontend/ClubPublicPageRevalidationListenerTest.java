package com.duing.global.frontend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 같은 동아리 상세 재생성을 경로당 최소 간격으로 합치는 규칙(#1389 후속) — 운영진의 연속 수정이나 자동 저장 버그가
 * Vercel 재생성을 무제한으로 일으키지 않게 하면서, 간격 안의 마지막 변경은 간격 끝에 반영한다.
 * 시계와 지연 실행을 손으로 움직여 실제 대기 없이 순서를 고정한다.
 */
class ClubPublicPageRevalidationListenerTest {

    private static final Duration MIN_INTERVAL = Duration.ofSeconds(60);

    private final FrontendRevalidator frontendRevalidator = mock(FrontendRevalidator.class);
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-06T03:00:00Z"));
    private final List<DelayedRun> delayedRuns = new ArrayList<>();
    private final ClubPublicPageRevalidationListener listener = new ClubPublicPageRevalidationListener(
            frontendRevalidator, clock, MIN_INTERVAL,
            (delay, task) -> delayedRuns.add(new DelayedRun(delay, task)));

    private void changeClub(long clubId) {
        listener.onClubPublicPageChanged(new ClubPublicPageChangedEvent(clubId));
    }

    @Test
    @DisplayName("간격 밖의 첫 변경은 바로 요청한다")
    void firstChangeRequestsImmediately() {
        changeClub(7L);

        verify(frontendRevalidator).revalidateWithoutAlert("/clubs/7");
        assertThat(delayedRuns).isEmpty();
    }

    @Test
    @DisplayName("간격 안에서 연달아 바꾸면 바로 한 번, 간격이 끝날 때 한 번만 더 요청한다")
    void burstWithinIntervalCollapsesToOneTrailingRequest() {
        changeClub(7L);
        clock.advance(Duration.ofSeconds(10));
        changeClub(7L);
        clock.advance(Duration.ofSeconds(10));
        changeClub(7L);
        changeClub(7L);

        verify(frontendRevalidator, times(1)).revalidateWithoutAlert("/clubs/7");
        assertThat(delayedRuns).hasSize(1);
        assertThat(delayedRuns.get(0).delay()).isEqualTo(Duration.ofSeconds(50));

        clock.advance(Duration.ofSeconds(40));
        delayedRuns.get(0).task().run();

        verify(frontendRevalidator, times(2)).revalidateWithoutAlert("/clubs/7");
        verifyNoMoreInteractions(frontendRevalidator);
    }

    @Test
    @DisplayName("서로 다른 동아리는 서로의 간격에 막히지 않는다")
    void differentClubsDoNotThrottleEachOther() {
        changeClub(7L);
        changeClub(8L);

        verify(frontendRevalidator).revalidateWithoutAlert("/clubs/7");
        verify(frontendRevalidator).revalidateWithoutAlert("/clubs/8");
        assertThat(delayedRuns).isEmpty();
    }

    @Test
    @DisplayName("간격이 지난 뒤의 변경은 다시 바로 요청한다")
    void changeAfterIntervalRequestsImmediately() {
        changeClub(7L);
        clock.advance(MIN_INTERVAL);
        changeClub(7L);

        verify(frontendRevalidator, times(2)).revalidateWithoutAlert("/clubs/7");
        assertThat(delayedRuns).isEmpty();
    }

    @Test
    @DisplayName("예약 실행 뒤의 변경은 그 실행 시각부터 간격을 다시 센다")
    void changeAfterTrailingRunWaitsFromThatRun() {
        changeClub(7L);
        clock.advance(Duration.ofSeconds(30));
        changeClub(7L);
        clock.advance(Duration.ofSeconds(30));
        delayedRuns.get(0).task().run();
        clock.advance(Duration.ofSeconds(10));

        changeClub(7L);

        verify(frontendRevalidator, times(2)).revalidateWithoutAlert("/clubs/7");
        assertThat(delayedRuns).hasSize(2);
        assertThat(delayedRuns.get(1).delay()).isEqualTo(Duration.ofSeconds(50));
    }

    @Test
    @DisplayName("예약 실행이 늦어져 예정 시각을 지나 들어온 변경은 바로 요청하지 않고 그 예약 실행에 맡긴다")
    void changeAfterRunAtButBeforeTrailingRunIsLeftToThatRun() {
        changeClub(7L);
        clock.advance(Duration.ofSeconds(30));
        changeClub(7L);
        // 예약(+60초) 실행이 다른 동아리 요청에 밀려 아직 큐에 있다.
        clock.advance(Duration.ofSeconds(40));

        changeClub(7L);

        verify(frontendRevalidator, times(1)).revalidateWithoutAlert("/clubs/7");
        assertThat(delayedRuns).hasSize(1);

        delayedRuns.get(0).task().run();

        verify(frontendRevalidator, times(2)).revalidateWithoutAlert("/clubs/7");
    }

    @Test
    @DisplayName("예약한 실행이 버려져 돌지 않았으면, 예정 시각에서 간격이 지난 뒤의 변경이 다시 요청한다")
    void droppedTrailingRunDoesNotBlockLaterChanges() {
        changeClub(7L);
        clock.advance(Duration.ofSeconds(30));
        changeClub(7L);
        // 예약 실행(예정 +60초)이 실행기 포화로 버려져 끝내 돌지 않았다.
        clock.advance(Duration.ofSeconds(100));

        changeClub(7L);

        verify(frontendRevalidator, times(2)).revalidateWithoutAlert("/clubs/7");
        assertThat(delayedRuns).hasSize(1);
    }

    @Test
    @DisplayName("운영 배선에서 간격 끝의 예약 실행은 전용 실행기 스레드로 돌아와 요청한다")
    void productionWiringRunsTrailingRequestOnDedicatedExecutor() throws Exception {
        ThreadPoolTaskExecutor executor = new FrontendRevalidationAsyncConfig().frontendRevalidationTaskExecutor();
        executor.initialize();
        try {
            CompletableFuture<String> trailingThreadName = new CompletableFuture<>();
            doAnswer(invocation -> null)
                    .doAnswer(invocation -> trailingThreadName.complete(Thread.currentThread().getName()))
                    .when(frontendRevalidator).revalidateWithoutAlert("/clubs/7");
            // 멈춘 시계라 두 호출 사이에 실제 시간이 얼마나 흘러도 두 번째는 간격 안이다 — 실시간 의존은 지연 실행 하나뿐이다.
            ClubPublicPageRevalidationListener wiredListener = new ClubPublicPageRevalidationListener(
                    frontendRevalidator, clock, Duration.ofMillis(200), executor);

            wiredListener.onClubPublicPageChanged(new ClubPublicPageChangedEvent(7L));
            wiredListener.onClubPublicPageChanged(new ClubPublicPageChangedEvent(7L));

            assertThat(trailingThreadName.get(3, TimeUnit.SECONDS)).startsWith("frontend-revalidate-");
            verify(frontendRevalidator, times(2)).revalidateWithoutAlert("/clubs/7");
        } finally {
            executor.shutdown();
        }
    }

    private record DelayedRun(Duration delay, Runnable task) {
    }

    /** 테스트에서 손으로 미는 시계. */
    private static final class MutableClock extends Clock {

        private Instant now;

        private MutableClock(Instant start) {
            this.now = start;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("Asia/Seoul");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
