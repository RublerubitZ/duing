package com.duing.global.monitoring;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 운영 알림 전용 비동기 실행기. {@link OpsSlackListener} 의 {@code @Async} 메서드만 이 풀에서 돈다 —
 * 커밋 후 Slack 전송이 요청 스레드의 응답 시간·결과에 영향을 주지 않게 한다.
 *
 * <p>{@code @EnableAsync} 는 레포에서 처음 켠다. 기존 리스너에는 {@code @Async} 가 없어 동작이 바뀌지 않는다.
 * 이 빈이 생기면 Boot 의 기본 {@code applicationTaskExecutor} 는 물러나는데(ConditionalOnMissingBean(Executor)),
 * MVC async(Callable/SseEmitter) 등 그 빈의 소비자가 코드베이스에 없음을 확인했다(2026-08-23).
 *
 * <p>풀은 작게(1~2 스레드, 큐 100) — 알림은 손실 허용이라 포화 시 폐기하고 warn 만 남긴다.
 * 종료 시 진행 중 전송을 최대 5초 기다려 배포 순간의 마지막 알림이 끊기지 않게 한다.
 */
@Slf4j
@Configuration
@EnableAsync
public class MonitoringAsyncConfig {

    public static final String EXECUTOR_BEAN_NAME = "monitoringTaskExecutor";

    @Bean(EXECUTOR_BEAN_NAME)
    public ThreadPoolTaskExecutor monitoringTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("ops-slack-");
        executor.setRejectedExecutionHandler((rejectedTask, pool) ->
                log.warn("운영 알림 큐 포화 — 이번 Slack 알림을 폐기한다(핵심 서비스 무영향)."));
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(5);
        return executor;
    }
}
