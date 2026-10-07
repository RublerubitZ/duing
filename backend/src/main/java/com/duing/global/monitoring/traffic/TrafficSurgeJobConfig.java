package com.duing.global.monitoring.traffic;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 트래픽 이상 감지 잡({@link TrafficSurgeMonitor})의 스케줄러를 켠다. {@code duing.monitoring.traffic-surge.enabled=true}
 * 일 때만 켜고 다른 잡 설정의 스케줄러에 기대지 않는다({@code ClubMetricJobConfig} 와 같은 격리 패턴).
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.monitoring.traffic-surge", name = "enabled", havingValue = "true")
public class TrafficSurgeJobConfig {
}
