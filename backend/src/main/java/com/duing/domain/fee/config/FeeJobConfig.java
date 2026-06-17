package com.duing.domain.fee.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 회비 연체 전이 크론을 활성화하는 설정 클래스.
 * {@code DUING_FEE_OVERDUE_ENABLED=true} 환경변수(또는 yml 키)가 설정된 경우에만 스케줄링이 켜진다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.fee.overdue", name = "enabled", havingValue = "true")
public class FeeJobConfig {}
