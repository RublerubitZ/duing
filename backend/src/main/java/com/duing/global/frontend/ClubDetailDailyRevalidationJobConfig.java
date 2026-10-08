package com.duing.global.frontend;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 동아리 상세 매일 재생성 크론을 켜는 설정 — {@code duing.frontend.club-detail-daily.enabled=true} 일 때만
 * {@code @EnableScheduling} 으로 스케줄러를 켠다. 다른 잡 설정의 스케줄러에 무임승차하지 않는다
 * ({@code ClubMetricJobConfig} 와 같은 격리 패턴).
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.frontend.club-detail-daily", name = "enabled", havingValue = "true")
public class ClubDetailDailyRevalidationJobConfig {
}
