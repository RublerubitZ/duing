package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.springframework.stereotype.Component;

/**
 * 예약 신청 비즈니스 정책의 단일 진입점(Facade/Orchestrator, 설계 spec 2026-07-18) —
 * 정책을 직접 구현하지 않고 조합·검증 순서만 관리한다. 순서 = 오류 우선순위:
 * ① 반월 창 → ② 신청 마감 → ③ 중앙동아리 → ④ 역할. 첫 실패의 예외만 던진다(다중 오류 미반환).
 * 날짜 정책이 권한보다 먼저다 — 사용자에게 먼저 알릴 것은 "신청 가능한 날짜인지"이기 때문.
 *
 * <p>새 정책(시험기간·시설별·관리자 예외 등)은 내부 정책 클래스를 추가하고 이 조합만 확장한다 —
 * 호출부(Service·Availability)는 불변. 기술적 검증(슬롯 그리드·당일·활성 상한)은
 * BookingPolicyValidator 소관으로 여기 두지 않는다. 엔티티 로드는 호출부 책임(정책은 순수 판정).
 */
@Component
public class BookingApplicationPolicy {

    private final Clock clock;
    private final BookingWindowPolicy bookingWindowPolicy;
    private final BookingDeadlinePolicy deadlinePolicy = new BookingDeadlinePolicy();
    private final ClubEligibilityPolicy eligibilityPolicy = new ClubEligibilityPolicy();
    private final BookingRolePolicy rolePolicy = new BookingRolePolicy();

    public BookingApplicationPolicy(Clock clock, BookingWindowPolicy bookingWindowPolicy) {
        this.clock = clock;
        this.bookingWindowPolicy = bookingWindowPolicy;
    }

    public void validateApplication(Club club, ClubMember applicant, LocalDate reservationDate) {
        LocalDateTime now = LocalDateTime.now(clock);
        BookingWindow window = bookingWindowPolicy.windowFor(now.toLocalDate());
        if (!window.contains(reservationDate)) {
            throw new FacilityBookingException.OutOfBookingWindowException(window);
        }
        deadlinePolicy.validate(reservationDate, now);
        eligibilityPolicy.validate(club);
        rolePolicy.validate(applicant);
    }

    /**
     * 반월 창 계산 접근자 — 가용성·윈도우 API 도 이 진입점만 사용한다(BookingWindowPolicy 직접 주입 금지).
     * 단, BookingPolicyValidator 의 직접 주입은 당일 가드 예외 메시지 구성용으로 남긴 의도된 예외다.
     */
    public BookingWindow windowFor(LocalDate today) {
        return bookingWindowPolicy.windowFor(today);
    }
}
