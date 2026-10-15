package com.duing.domain.club.thumbnail.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@ExtendWith(OutputCaptureExtension.class)
class ClubLogoThumbnailAsyncConfigTest {

    private final CountDownLatch releaseRunningTask = new CountDownLatch(1);

    @AfterEach
    void tearDown() {
        releaseRunningTask.countDown();
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

    // 운영 종료는 컨텍스트 종료 경로다 — waitForTasksToCompleteOnShutdown=true 라 정지 단계는 기다리지 않고 지나가고 소멸 단계가
    // 2초만 기다린 뒤 포기한다. false 였다면 Spring 6.2 는 인터럽트 대신 정지 단계에서 진행 중 작업(아래는 5초 뒤 풀림)을 기다려
    // 4초 상한을 넘는다(FrontendRevalidationAsyncConfigTest 와 같은 관찰). 대기를 0 으로 바꾸면 타임아웃 WARN 이 나지 않는다.
    @Test
    @DisplayName("컨텍스트 종료 때 끝나지 않는 진행 중 생성은 잠시 기다리다 포기하고, 종료는 4초 안에 끝난다")
    void contextCloseDoesNotWaitLongForRunningGeneration(CapturedOutput output) throws InterruptedException {
        AnnotationConfigApplicationContext context =
                new AnnotationConfigApplicationContext(ClubLogoThumbnailAsyncConfig.class);
        ThreadPoolTaskExecutor contextExecutor = context.getBean(
                ClubLogoThumbnailAsyncConfig.EXECUTOR_BEAN_NAME, ThreadPoolTaskExecutor.class);
        occupyWorkerThread(contextExecutor);

        assertTimeoutPreemptively(Duration.ofSeconds(4), context::close);

        assertThat(output).contains("Timed out while waiting for executor '"
                + ClubLogoThumbnailAsyncConfig.EXECUTOR_BEAN_NAME + "' to terminate");
    }
}
