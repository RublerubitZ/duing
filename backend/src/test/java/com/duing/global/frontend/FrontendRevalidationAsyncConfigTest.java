package com.duing.global.frontend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@ExtendWith(OutputCaptureExtension.class)
class FrontendRevalidationAsyncConfigTest {

    private static final int QUEUE_CAPACITY = 100;

    private final ThreadPoolTaskExecutor executor =
            new FrontendRevalidationAsyncConfig().frontendRevalidationTaskExecutor();
    private final CountDownLatch releaseRunningTask = new CountDownLatch(1);

    @BeforeEach
    void setUp() {
        executor.initialize();
    }

    @AfterEach
    void tearDown() {
        releaseRunningTask.countDown();
        executor.shutdown();
    }

    /** 단일 스레드를 붙잡아 둔다 — 이어지는 제출은 큐로만 간다. 테스트가 깨져도 5초 뒤 스스로 풀린다. */
    private void occupyWorkerThread(ThreadPoolTaskExecutor target) throws InterruptedException {
        CountDownLatch runningTaskStarted = new CountDownLatch(1);
        target.execute(() -> {
            runningTaskStarted.countDown();
            try {
                releaseRunningTask.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        });
        assertThat(runningTaskStarted.await(1, TimeUnit.SECONDS)).isTrue();
    }

    @Test
    @DisplayName("스레드 하나가 일하고 큐 100 이 차면 다음 요청은 버리고 WARN 만 남긴다 — 제출한 스레드는 막히지도 예외를 받지도 않는다")
    void dropsOverflowWithoutBlockingSubmitter(CapturedOutput output) throws InterruptedException {
        occupyWorkerThread(executor);
        for (int queued = 0; queued < QUEUE_CAPACITY; queued++) {
            executor.execute(() -> { });
        }
        AtomicBoolean overflowTaskRan = new AtomicBoolean();

        assertTimeoutPreemptively(Duration.ofSeconds(1), () -> executor.execute(() -> overflowTaskRan.set(true)));

        assertThat(overflowTaskRan).as("CallerRuns 였다면 제출한 스레드에서 이미 돌았다").isFalse();
        assertThat(executor.getPoolSize()).as("스레드를 늘려 받지 않는다").isEqualTo(1);
        assertThat(executor.getQueueSize()).as("넘친 요청은 큐에도 들어가지 않는다").isEqualTo(QUEUE_CAPACITY);
        assertThat(output).contains("프론트 상세 재생성 큐 포화");
    }

    // 운영 종료는 컨텍스트 종료 경로다 — executor.shutdown() 직접 호출은 waitForTasksToCompleteOnShutdown(false) 에서도
    // shutdownNow() 인터럽트로 즉시 끝나 그 설정을 고정하지 못한다(플랜 리뷰 I-2). false 면 정지 단계가 진행 중 작업을
    // 기다려(아래 작업은 5초 뒤 스스로 풀림) 4초 상한을 넘는다.
    @Test
    @DisplayName("컨텍스트 종료 때 진행 중 요청이 끝나지 않아도 오래 기다리지 않는다 — 대기 상한 2초")
    void contextCloseDoesNotWaitLongForRunningRequest() throws InterruptedException {
        AnnotationConfigApplicationContext context =
                new AnnotationConfigApplicationContext(FrontendRevalidationAsyncConfig.class);
        ThreadPoolTaskExecutor contextExecutor = context.getBean(
                FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME, ThreadPoolTaskExecutor.class);
        occupyWorkerThread(contextExecutor);

        assertTimeoutPreemptively(Duration.ofSeconds(4), context::close);
    }
}
