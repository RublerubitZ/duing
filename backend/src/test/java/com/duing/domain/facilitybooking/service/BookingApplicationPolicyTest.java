package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingApplicationPolicyTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    // KST 2026-01-10 12:30 — 반월 창 = 1/10 ~ 1/31. 12:01 이후라 익일(1/11) 사용분은 마감 상태.
    private static final Clock FIRST_HALF_AFTERNOON = Clock.fixed(Instant.parse("2026-01-10T03:30:00Z"), SEOUL);
    // KST 2026-01-10 12:00:59 — 마감 경계 직전(익일 사용분 아직 신청 가능)
    private static final Clock BOUNDARY_ALLOWED = Clock.fixed(Instant.parse("2026-01-10T03:00:59Z"), SEOUL);
    // KST 2026-01-10 12:01:00 — 마감 경계 도달
    private static final Clock BOUNDARY_REJECTED = Clock.fixed(Instant.parse("2026-01-10T03:01:00Z"), SEOUL);
    // KST 2026-01-20 12:30 — 하반기 창 = 1/20 ~ 2/15
    private static final Clock SECOND_HALF = Clock.fixed(Instant.parse("2026-01-20T03:30:00Z"), SEOUL);

    private final BookingWindowPolicy windowPolicy = new HalfMonthBookingWindowPolicy(15);

    private BookingApplicationPolicy policyAt(Clock clock) {
        return new BookingApplicationPolicy(clock, windowPolicy);
    }

    private static Club centralClub() {
        return Club.create("중앙동아리", ClubCategory.OTHER, "분과", "설명", null, true, null);
    }

    private static Club generalClub() {
        return Club.create("일반동아리", ClubCategory.OTHER, "분과", "설명", null);
    }

    private static ClubMember memberOf(Club club, ClubMemberRole role) {
        return ClubMember.of(club, UserFixture.unique(), role);
    }

    @Test
    @DisplayName("중앙동아리 회장·운영진은 마감 전 창 내부 날짜를 신청할 수 있다")
    void centralManagerWithinWindowBeforeDeadlinePasses() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club club = centralClub();
        assertThatCode(() -> policy.validateApplication(club,
                memberOf(club, ClubMemberRole.LEADER), LocalDate.of(2026, 1, 12)))
                .doesNotThrowAnyException();
        assertThatCode(() -> policy.validateApplication(club,
                memberOf(club, ClubMemberRole.OFFICER), LocalDate.of(2026, 1, 31)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("상반기에는 창(오늘~당월 말일) 밖 날짜가 거부되고 메시지에 구간이 담긴다")
    void firstHalfWindowBoundsAreEnforced() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 1, 9)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 2, 1)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class)
                .hasMessageContaining("1월 10일")
                .hasMessageContaining("1월 31일");
    }

    @Test
    @DisplayName("하반기에는 익월 상반기 말일(15일)까지 신청할 수 있고 그 이후는 거부된다")
    void secondHalfWindowBoundsAreEnforced() {
        BookingApplicationPolicy policy = policyAt(SECOND_HALF);
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        assertThatCode(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 2, 15)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 2, 16)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("당일과 마감 지난 익일 사용분은 DEADLINE_PASSED 로 거부된다")
    void sameDayAndPastDeadlineTomorrowAreRejected() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON); // 12:30
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 1, 10)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 1, 11)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("마감 경계 — 전날 12:00:59에는 신청되고 12:01:00에는 거부된다")
    void deadlineBoundaryIsMinutePrecise() {
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        LocalDate tomorrow = LocalDate.of(2026, 1, 11);
        assertThatCode(() -> policyAt(BOUNDARY_ALLOWED).validateApplication(club, leader, tomorrow))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policyAt(BOUNDARY_REJECTED).validateApplication(club, leader, tomorrow))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 창 밖이면 자격·권한 문제보다 창 오류가 먼저다")
    void windowErrorPrecedesPermissionErrors() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(general,
                memberOf(general, ClubMemberRole.MEMBER), LocalDate.of(2026, 2, 1)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 마감된 날짜면 자격·권한 문제보다 마감 오류가 먼저다")
    void deadlineErrorPrecedesPermissionErrors() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(general,
                memberOf(general, ClubMemberRole.MEMBER), LocalDate.of(2026, 1, 10)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 날짜가 유효하면 중앙동아리 자격이 역할보다 먼저다")
    void eligibilityErrorPrecedesRoleError() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(general,
                memberOf(general, ClubMemberRole.MEMBER), LocalDate.of(2026, 1, 12)))
                .isInstanceOf(FacilityBookingException.CentralClubOnlyException.class);
    }

    @Test
    @DisplayName("날짜·자격이 유효한 중앙동아리 일반회원은 PERMISSION_DENIED 로 거부된다")
    void centralClubMemberIsRejectedByRole() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club club = centralClub();
        assertThatThrownBy(() -> policy.validateApplication(club,
                memberOf(club, ClubMemberRole.MEMBER), LocalDate.of(2026, 1, 12)))
                .isInstanceOf(FacilityBookingException.PermissionDeniedException.class);
    }

    @Test
    @DisplayName("windowFor 는 반월 정책 계산을 그대로 위임한다")
    void windowForDelegatesToWindowPolicy() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        org.assertj.core.api.Assertions.assertThat(policy.windowFor(LocalDate.of(2026, 1, 10)))
                .isEqualTo(windowPolicy.windowFor(LocalDate.of(2026, 1, 10)));
    }
}
