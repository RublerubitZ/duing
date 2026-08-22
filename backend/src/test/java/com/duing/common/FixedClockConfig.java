package com.duing.common;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * 테스트의 '오늘'을 {@link #TODAY} 자정(Asia/Seoul)으로 고정하는 공용 시계 설정.
 *
 * <p><b>왜 common 인가</b> — 자구가 완전히 같은 중첩 {@code FixedClockConfig} 가 회비 테스트 7곳에
 * 복제돼 있었다. 중첩 클래스는 파일마다 서로 다른 타입이라 Spring 의 컨텍스트 캐시 키도 7가지로 갈리고,
 * 나머지 설정이 똑같아도 컨텍스트가 7번 따로 기동됐다(실측: HikariPool-1..7). 타입을 하나로 모으면
 * 웹 환경·프로퍼티 축이 같은 테스트끼리 캐시를 공유한다(실측 7 → 3).
 *
 * <p>같은 이유로 {@link TestcontainersConfiguration} 에는 넣지 않는다 — 거기에 두면 컨테이너를 쓰는
 * 통합 테스트 전체의 시각 의미가 바뀐다. 고정 시계가 필요한 테스트만 명시적으로 {@code @Import} 한다.
 *
 * <p><b>{@link #TODAY} 의 의미</b> — 회비 픽스처가 공유하는 기준일이다. 표기 상태(displayStatus)가
 * 마감 경과 여부로 갈리므로, 마감이 지난 회차(2026-05)와 아직 남은 회차(2026-07·2026-08)가 이 날짜를
 * 사이에 두고 나뉜다. 발행일 판정(issue_day = 15)도 이 날짜에 맞춰져 있다. 값을 바꾸면 7개 테스트의
 * 기대값이 함께 흔들리므로 픽스처와 같이 옮겨야 한다.
 */
@TestConfiguration
public class FixedClockConfig {

    /** 고정된 '오늘'(Asia/Seoul 기준). */
    public static final LocalDate TODAY = LocalDate.of(2026, 6, 15);

    @Bean
    @Primary
    Clock fixedClock() {
        return Clock.fixed(TODAY.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(), ZoneId.of("Asia/Seoul"));
    }
}
