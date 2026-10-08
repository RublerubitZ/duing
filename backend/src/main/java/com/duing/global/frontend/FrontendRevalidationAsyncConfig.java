package com.duing.global.frontend;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 동아리 상세 재생성(#1356) 전용 비동기 실행기 — {@code ClubPublicPageRevalidationListener} 의 {@code @Async} 메서드만
 * 이 풀에서 돈다. {@code @EnableAsync} 는 {@code MonitoringAsyncConfig} 가 켠다.
 *
 * <p>{@code monitoringTaskExecutor} 를 쓰지 않는다 — Slack 알림 전용 작은 풀이라 1초 대기·10초 타임아웃 작업이 알림을
 * 밀어낸다. 단일 스레드라 이 실행기의 요청끼리는 하나씩 나가 프론트 재검증·warm-up 렌더가 겹치지 않는다. 다만 매일
 * 00:05 잡({@code ClubDetailDailyRevalidationJob})은 스케줄러 스레드에서 보내므로 그 시각에는 최대 2건이 겹칠 수
 * 있다(무해하다). 같은 동아리 요청은 리스너가 최소 간격으로 합치고, 간격 끝의 예약 실행도 이 실행기로 돌아와 같은
 * 스레드에서 나간다.
 *
 * <p>큐(100)가 차면 버리고 WARN 만 남긴다 — 커밋한 요청 스레드를 막지 않는 것이 계약이다(CallerRuns·Abort 금지). 잃은
 * 요청은 상세의 자체 재생성 주기가 상한이다. 종료 때는 진행 중·대기 요청을 최대 2초만 기다린다 — 모니터링 실행기(5초)와
 * 합쳐도 Docker 기본 종료 유예(10초) 안이고, 끊긴 요청도 그 주기가 상한이다.
 */
@Slf4j
@Configuration
public class FrontendRevalidationAsyncConfig {

    public static final String EXECUTOR_BEAN_NAME = "frontendRevalidationTaskExecutor";

    @Bean(EXECUTOR_BEAN_NAME)
    public ThreadPoolTaskExecutor frontendRevalidationTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("frontend-revalidate-");
        executor.setRejectedExecutionHandler((rejectedTask, pool) ->
                log.warn("프론트 상세 재생성 큐 포화(또는 종료 중) — 이번 요청을 버린다(상세는 자체 재생성 주기가 상한)."));
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(2);
        return executor;
    }
}
