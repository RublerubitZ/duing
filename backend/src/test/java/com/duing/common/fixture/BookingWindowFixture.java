package com.duing.common.fixture;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 테스트용 "지금 신청 가능한 날짜" — 실행 시점과 무관하게 항상 신청 창 내부 날짜를 만든다(하드코딩 날짜 = CI 타임밤 금지).
 *
 * <p>기준 시각은 KST(Asia/Seoul)로 고정한다 — 신청 검증기(BookingPolicyValidator)·가용성 서비스가
 * seoulClock(KST) 기준으로 창을 계산하므로, UTC CI 러너에서 {@code LocalDate.now()}(JVM 기본존)를 쓰면
 * 자정~오전(KST) 구간에서 fixture 날짜와 검증기 판정이 하루 어긋나 결정적 실패가 난다.
 */
public final class BookingWindowFixture {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private BookingWindowFixture() {}

    /**
     * 시각 무관 항상 신청 가능한 날짜 = 모레(오늘+2).
     * 내일은 신청 마감 정책(사용일 전날 12:01 KST 마감)에 의해 실행 시각이 12:01 이후면 거부되는
     * 타임밤이다. 모레의 마감은 내일 12:00 — 언제 실행해도 미래라 항상 신청 가능하다.
     * 창 내부 보장: 상한이 익월 말일이라 오늘+2 는 항상 포함된다(오픈일이 과거인 시설 기준).
     */
    public static LocalDate bookableDate() {
        return LocalDate.now(KST).plusDays(2);
    }
}
