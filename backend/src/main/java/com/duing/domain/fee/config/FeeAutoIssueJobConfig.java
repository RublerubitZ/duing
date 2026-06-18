package com.duing.domain.fee.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 회비 자동 월발행 크론을 활성화하는 설정 클래스.
 * {@code DUING_FEE_AUTO_ISSUE_ENABLED=true} 환경변수(또는 yml 키)가 설정된 경우에만 스케줄링이 켜진다.
 * 연체 크론(FeeJobConfig, duing.fee.overdue)과 독립 on/off 하기 위해 별도 @EnableScheduling 설정을 둔다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.fee.auto-issue", name = "enabled", havingValue = "true")
public class FeeAutoIssueJobConfig {}
