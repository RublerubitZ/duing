package com.duing.domain.facilitybooking.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * APPROVED → CONFIRMED 자동 매칭 크론을 활성화하는 설정 클래스.
 * {@code duing.facility.booking.matching.enabled=true}(운영 기본 true, 로컬/테스트 false)일 때만 스케줄링이 켜진다.
 * 크롤 스케줄러(FacilityCrawlerJobConfig, duing.facility.crawler)와 독립 on/off 하기 위해 별도 @EnableScheduling 설정을 둔다 —
 * 이 설정이 없으면 매칭 잡의 @Scheduled 는 다른 잡의 @EnableScheduling 이 켜져 있을 때만 우연히 발화한다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.facility.booking.matching", name = "enabled", havingValue = "true")
public class FacilityBookingMatchingJobConfig {}
