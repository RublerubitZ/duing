package com.duing.global.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 시각 제공 전용 설정.
 * <p>도메인이 \"한국 시간\" 기준으로 동작해야 하는 잡/리포트 등에서 {@link Clock} 을 주입받아
 * 테스트 시 시계를 고정할 수 있도록 한다.
 */
@Configuration
public class TimeConfig {

    @Bean
    public Clock seoulClock() {
        return Clock.system(ZoneId.of("Asia/Seoul"));
    }
}
