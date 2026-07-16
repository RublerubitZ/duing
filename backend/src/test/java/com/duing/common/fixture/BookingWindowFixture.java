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
     * 시각 무관 항상 신청 가능한 날짜 = 내일. 롤링 창은 오늘을 포함하지만, 오늘을 쓰면 고정 슬롯
     * 시각(10:00 등)이 KST 실행 시각에 따라 당일 가드에 걸리는 타임밤이 된다.
     * 내일은 항상 창 내부다: until(다음 반월 말일) &gt; 다음 반월 시작일 &gt; 오늘 ⇒ until ≥ 오늘+1.
     */
    public static LocalDate bookableDate() {
        return LocalDate.now(KST).plusDays(1);
    }
}
