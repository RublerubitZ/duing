package com.duing.domain.adminconsole.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 처리 대기 추이 일별 기록 크론을 활성화하는 설정 클래스.
 * {@code duing.admin.pending-snapshot.enabled=true} 일 때만 {@code @EnableScheduling} 으로 스케줄러를 켠다 —
 * 다른 잡 설정의 스케줄러에 무임승차하지 않고 자기 플래그만으로 독립 동작하게 한다
 * ({@code RecruitmentAutoCloseJobConfig} 와 같은 격리 패턴, 도메인 잡 설정은 {@code config/}).
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.admin.pending-snapshot", name = "enabled", havingValue = "true")
public class AdminPendingSnapshotJobConfig {
}
