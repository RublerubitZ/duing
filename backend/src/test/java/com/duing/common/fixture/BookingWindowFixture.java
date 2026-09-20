package com.duing.common.fixture;

import com.duing.domain.facility.entity.Facility;
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

    /** 과거 오픈일 — 창 판정이 오늘로 clamp 되므로 실행 시점과 무관하게 "이미 열린 시설" 을 뜻한다. */
    public static final LocalDate OPEN_SINCE = LocalDate.of(2020, 1, 1);

    private BookingWindowFixture() {}

    /**
     * 예약 신청 경로를 타는 시설 시드에 오픈일을 심는다 — 오픈일 NULL 은 닫힘이라 시드 그대로면 신청이 400 이다.
     * {@code facilityRepository.save(BookingWindowFixture.opened(Facility.create(...)))} 형태로 쓴다.
     */
    public static Facility opened(Facility facility) {
        facility.changeBookingOpenDate(OPEN_SINCE);
        return facility;
    }

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
