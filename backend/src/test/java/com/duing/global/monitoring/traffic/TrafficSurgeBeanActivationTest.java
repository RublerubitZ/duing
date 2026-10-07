package com.duing.global.monitoring.traffic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.duing.global.monitoring.OpsSlackMessageFormatter;
import com.duing.global.monitoring.SlackNotifier;
import java.time.Clock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/** 비활성이 기본이고(로컬·CI·기존 통합 테스트 무영향), 켜면 필터·판정 잡·스케줄 설정이 함께 뜨는지 지킨다. */
class TrafficSurgeBeanActivationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(TrafficSurgeJobConfig.class, TrafficCountingFilter.class, TrafficSurgeMonitor.class)
            .withBean(OpsSlackMessageFormatter.class, () -> mock(OpsSlackMessageFormatter.class))
            .withBean(SlackNotifier.class, () -> mock(SlackNotifier.class))
            .withBean(Clock.class, Clock::systemUTC);

    @Test
    @DisplayName("플래그가 없으면 필터·판정 잡·스케줄 설정이 모두 없다")
    void inactiveWithoutFlag() {
        runner.run(context -> assertThat(context)
                .doesNotHaveBean(TrafficSurgeJobConfig.class)
                .doesNotHaveBean(TrafficCountingFilter.class)
                .doesNotHaveBean(TrafficSurgeMonitor.class));
    }

    @Test
    @DisplayName("enabled=true 면 필터·판정 잡·스케줄 설정이 함께 등록된다")
    void activeWhenEnabled() {
        runner.withPropertyValues("duing.monitoring.traffic-surge.enabled=true")
                .run(context -> assertThat(context)
                        .hasSingleBean(TrafficSurgeJobConfig.class)
                        .hasSingleBean(TrafficCountingFilter.class)
                        .hasSingleBean(TrafficSurgeMonitor.class));
    }
}
