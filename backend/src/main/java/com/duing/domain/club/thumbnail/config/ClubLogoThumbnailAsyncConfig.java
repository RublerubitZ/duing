package com.duing.domain.club.thumbnail.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 동아리 로고 썸네일 전용 비동기 실행기 — {@code ClubLogoThumbnailListener} 의 {@code @Async} 메서드와 기동 뒤 백필
 * ({@code ClubLogoThumbnailBackfillRunner})이 이 풀에서 돈다. {@code @EnableAsync} 는 {@code MonitoringAsyncConfig} 가 켠다.
 *
 * <p>상세 재생성 실행기({@code frontendRevalidationTaskExecutor})를 빌려 쓰지 않는다 — 이미지 디코딩·스토리지 왕복이 그 풀의
 * 재생성 요청을 밀어낸다. 단일 스레드라 백필과 변경 이벤트 생성이 겹치지 않고(같은 동아리를 두 번 만들지 않는다 — 그래도
 * 반영은 조건부 갱신이 지킨다), 래스터 메모리가 한 번에 하나만 산다.
 *
 * <p>큐(100)가 차면 버리고 WARN 만 남긴다 — 커밋한 요청 스레드를 막지 않는 것이 계약이다. 버려진 생성은 썸네일이 비어 있는
 * 채라 다음 기동의 백필이 메운다. 종료 설정은 기존 두 실행기와 같다 — 진행 중 작업을 끝까지 기다리되 소멸 단계에서 최대 2초만.
 * Spring 6.2 에서 {@code waitForTasksToCompleteOnShutdown=false} 는 인터럽트가 아니라 "정지 단계가 진행 중 작업을 끝날 때까지
 * (기본 30초) 기다리는" 동작이어서(ContextClosedEvent 의 {@code initiateEarlyShutdown} 은 {@code shutdown()} 만 부른다) 쓰지
 * 않는다. 수 분 도는 백필은 러너가 ContextClosedEvent 에서 세우는 중단 플래그로 멈춘다.
 */
@Slf4j
@Configuration
public class ClubLogoThumbnailAsyncConfig {

    public static final String EXECUTOR_BEAN_NAME = "clubLogoThumbnailTaskExecutor";

    @Bean(EXECUTOR_BEAN_NAME)
    public ThreadPoolTaskExecutor clubLogoThumbnailTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("logo-thumbnail-");
        executor.setRejectedExecutionHandler((rejectedTask, pool) ->
                log.warn("[로고 썸네일] 실행 큐 포화(또는 종료 중) — 이번 생성을 버린다(비어 있는 썸네일은 다음 기동의 백필이 만든다)."));
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(2);
        return executor;
    }
}
