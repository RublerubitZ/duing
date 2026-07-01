package com.duing.domain.facility.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 시설 예약/목록 크롤 스케줄러를 활성화하는 설정.
 * {@code duing.facility.crawler.enabled=true}(운영 기본 true, 로컬/테스트 false)일 때만 스케줄링이 켜진다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.facility.crawler", name = "enabled", havingValue = "true")
public class FacilityCrawlerJobConfig {}
