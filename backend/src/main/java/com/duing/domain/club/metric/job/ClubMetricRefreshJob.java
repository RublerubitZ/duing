package com.duing.domain.club.metric.job;

import com.duing.domain.club.metric.service.ClubMetricService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 추천순 활동점수 집계 잡 — 매시 정각(Asia/Seoul) + 기동 직후 1회(빈 테이블 공백 방지).
 * 정각으로 둔 이유: 점수는 전체 최댓값 정규화라 재계산 시 전 동아리 finalScore 가 함께 움직인다 —
 * hour bucket 이 바뀌며 어차피 전면 reshuffle 되는 정각에 맞춰, bucket 중간의 두 번째 순서 변동
 * 지점을 만들지 않는다. 스케줄러는 {@code ClubMetricJobConfig} 가 자기 플래그로 켠다(무임승차 금지).
 * 실패해도 목록은 COALESCE(0)/이전 점수로 동작하므로(fail-open) 예외는 로그만 남기고 삼킨다 —
 * 특히 기동 리스너에서 예외가 전파되면 부팅이 실패한다.
 * {@code duing.club.metric.enabled=true} 에서만 등록.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.club.metric", name = "enabled", havingValue = "true")
public class ClubMetricRefreshJob {

    private final ClubMetricService clubMetricService;

    @EventListener(ApplicationReadyEvent.class)
    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    public void refresh() {
        try {
            clubMetricService.refreshAll();
            log.info("ClubMetricRefreshJob: 동아리 활동 지표 재집계 완료");
        } catch (Exception refreshError) {
            log.error("ClubMetricRefreshJob: 재집계 실패 — 추천 정렬은 기존/0 점수로 동작", refreshError);
        }
    }
}
