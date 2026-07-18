package com.duing.common.fixture;

import com.duing.domain.facilitybooking.service.BookingWindow;
import com.duing.domain.facilitybooking.service.HalfMonthBookingWindowPolicy;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 테스트용 "지금 신청 가능한 날짜" — 프로덕션 반월 정책(pivot=15, 기본 설정과 동일)을 재사용해
 * 실행 시점과 무관하게 항상 창 내부 날짜를 만든다(하드코딩 날짜 = CI 타임밤 금지).
 *
 * <p>기준 시각은 KST(Asia/Seoul)로 고정한다 — 신청 검증기(BookingPolicyValidator)·가용성 서비스가
 * seoulClock(KST) 기준으로 창을 계산하므로, UTC CI 러너에서 {@code LocalDate.now()}(JVM 기본존)를 쓰면
 * 자정~오전(KST) 구간의 pivot 경계에서 fixture 창과 검증기 창이 하루 어긋나 결정적 실패가 난다.
 */
public final class BookingWindowFixture {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final HalfMonthBookingWindowPolicy POLICY = new HalfMonthBookingWindowPolicy(15);

    private BookingWindowFixture() {}

    public static BookingWindow window() {
        return POLICY.windowFor(LocalDate.now(KST));
    }

    /**
     * 시각 무관 항상 신청 가능한 날짜 = 모레(오늘+2).
     * 내일은 신청 마감 정책(사용일 전날 12:01 KST 마감)에 의해 실행 시각이 12:01 이후면 거부되는
     * 타임밤이다. 모레의 마감은 내일 12:00 — 언제 실행해도 미래라 항상 신청 가능하다.
     * 반월 창 내부 보장: until(다음 반월 말일)은 최솟값이 매월 13~15일 이상 남는 구조라 오늘+2 를 항상 포함한다.
     */
    public static LocalDate bookableDate() {
        return LocalDate.now(KST).plusDays(2);
    }
}
