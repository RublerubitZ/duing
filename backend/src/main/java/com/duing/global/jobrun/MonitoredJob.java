package com.duing.global.jobrun;

import java.time.Duration;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.core.env.PropertyResolver;

/**
 * 총동연 홈 "자동 작업" 카드가 보여 주는 스케줄 잡 — 선언 순서가 화면 순서다.
 *
 * <p>{@code enabledProperty} 는 그 잡을 켜는 설정 이름이다. 잡 클래스(문의 파기는 잡 설정 클래스)의
 * {@code @ConditionalOnProperty} 와 같아야 한다 — {@code MonitoredJobTest} 가 확인한다.
 * {@code maxGap} 은 마지막 종료 뒤 이만큼 기록이 없으면 "늦음", {@code warnAfterRuns} 는 일부 실패·실패가 이만큼
 * 이어져야 경고한다(10분 잡이 한 번 흔들린 것은 경고하지 않는다). 표시 이름·업무 영향 문장은 화면 문구라 프론트가 가진다.
 */
@Getter
@RequiredArgsConstructor
public enum MonitoredJob {

    /** 매일 00:40 KST — 하루 + 여유 2시간, 한 번 실패도 경고. */
    RECRUITMENT_AUTO_CLOSE("duing.recruitment.auto-close.enabled", Duration.ofHours(26), 1),
    /** 매일 09:30 KST. */
    APPLICATION_PENDING_REMINDER("duing.notification.jobs.enabled", Duration.ofHours(26), 1),
    /** 10분마다 — 세 번 연속 기록이 없으면 늦음, 세 번 연속 실패여야 경고. */
    FACILITY_RESERVATION_CRAWL("duing.facility.crawler.enabled", Duration.ofMinutes(30), 3),
    /** 10분마다(3분 오프셋). */
    FACILITY_BOOKING_MATCHING("duing.facility.booking.matching.enabled", Duration.ofMinutes(30), 3),
    /** 매일 04:40 KST. */
    FEDERATION_INQUIRY_PURGE("duing.federation-inquiry.purge.enabled", Duration.ofHours(26), 1);

    private final String enabledProperty;
    private final Duration maxGap;
    private final int warnAfterRuns;

    /**
     * 이 잡이 켜져 있는가 — 잡 등록({@code @ConditionalOnProperty(havingValue = "true")})과 같은 기준(대소문자를 가리지 않는
     * "true" 만 켜짐)이다. {@code getProperty(name, Boolean.class)} 는 "on"·"yes" 도 참으로 읽어, 잡은 등록되지 않았는데
     * 켜진 것으로 보는 어긋남이 생긴다. 자동 작업 카드와 자동 마감 전망이 이 판정 하나를 쓴다.
     */
    public boolean isEnabledIn(PropertyResolver propertyResolver) {
        return "true".equalsIgnoreCase(propertyResolver.getProperty(enabledProperty));
    }
}
