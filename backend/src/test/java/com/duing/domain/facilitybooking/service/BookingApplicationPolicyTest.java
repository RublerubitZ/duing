package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingApplicationPolicyTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    // KST 2026-01-10 12:30 — 창 상한 = 익월 말일(2/28). 12:01 이후라 익일(1/11) 사용분은 마감 상태.
    private static final Clock AFTERNOON = Clock.fixed(Instant.parse("2026-01-10T03:30:00Z"), SEOUL);
    // KST 2026-01-10 12:00:59 — 마감 경계 직전(익일 사용분 아직 신청 가능)
    private static final Clock BOUNDARY_ALLOWED = Clock.fixed(Instant.parse("2026-01-10T03:00:59Z"), SEOUL);
    // KST 2026-01-10 12:01:00 — 마감 경계 도달
    private static final Clock BOUNDARY_REJECTED = Clock.fixed(Instant.parse("2026-01-10T03:01:00Z"), SEOUL);

    private static final LocalDate TODAY = LocalDate.of(2026, 1, 10);
    private static final LocalDate NEXT_MONTH_END = LocalDate.of(2026, 2, 28);
    private static final String CLOSED_MESSAGE = "아직 예약 신청이 열리지 않았어요.";

    private BookingApplicationPolicy policyAt(Clock clock) {
        return new BookingApplicationPolicy(clock);
    }

    /** 오픈일이 과거인 시설 — 창 판정이 오늘로 clamp 되어 창 외 정책(마감·자격·역할)만 남는다. */
    private static Facility openedFacility() {
        return facilityWithOpenDate(LocalDate.of(2020, 1, 1));
    }

    private static Facility facilityWithOpenDate(LocalDate bookingOpenDate) {
        Facility facility = Facility.create(90001, "커뮤니티룸(P)", null, 0);
        facility.changeBookingOpenDate(bookingOpenDate);
        return facility;
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
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Facility facility = openedFacility();
        Club club = centralClub();
        assertThatCode(() -> policy.validateApplication(facility, club,
                memberOf(club, ClubMemberRole.LEADER), LocalDate.of(2026, 1, 12)))
                .doesNotThrowAnyException();
        assertThatCode(() -> policy.validateApplication(facility, club,
                memberOf(club, ClubMemberRole.OFFICER), NEXT_MONTH_END))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("예약 오픈일이 없는 시설은 창이 닫혀 있어 어떤 날짜도 신청할 수 없다")
    void facilityWithoutOpenDateRejectsEveryDate() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Facility closedFacility = facilityWithOpenDate(null);
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);

        for (LocalDate date : new LocalDate[] {LocalDate.of(2026, 1, 12), NEXT_MONTH_END}) {
            assertThatThrownBy(() -> policy.validateApplication(closedFacility, club, leader, date))
                    .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class)
                    .hasMessage(CLOSED_MESSAGE);
        }
    }

    @Test
    @DisplayName("오픈일이 미래면 그 날부터 익월 말일까지만 신청할 수 있다")
    void futureOpenDateStartsTheWindow() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Facility facility = facilityWithOpenDate(TODAY.plusDays(5));
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);

        assertThatThrownBy(() -> policy.validateApplication(facility, club, leader, TODAY.plusDays(2)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class)
                .hasMessageContaining("1월 15일")
                .hasMessageContaining("2월 28일");
        assertThatCode(() -> policy.validateApplication(facility, club, leader, TODAY.plusDays(5)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policy.validateApplication(facility, club, leader, NEXT_MONTH_END.plusDays(1)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("오픈일이 과거여도 창의 시작은 오늘이라 지난 날짜는 거부되고 익월 말일까지는 신청된다")
    void pastOpenDateIsClampedToToday() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Facility facility = facilityWithOpenDate(TODAY.minusDays(30));
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);

        assertThat(policy.windowFor(facility, TODAY).from()).isEqualTo(TODAY);
        assertThatThrownBy(() -> policy.validateApplication(facility, club, leader, TODAY.minusDays(1)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatCode(() -> policy.validateApplication(facility, club, leader, NEXT_MONTH_END))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policy.validateApplication(facility, club, leader, NEXT_MONTH_END.plusDays(1)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("오픈일이 익월 말일을 넘어서면 창이 비어 닫힘과 같은 안내를 준다")
    void openDateBeyondWindowIsTreatedAsClosed() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Facility facility = facilityWithOpenDate(NEXT_MONTH_END.plusDays(1));
        Club club = centralClub();

        assertThatThrownBy(() -> policy.validateApplication(facility, club,
                memberOf(club, ClubMemberRole.LEADER), LocalDate.of(2026, 1, 12)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class)
                .hasMessage(CLOSED_MESSAGE);
    }

    @Test
    @DisplayName("당일과 마감 지난 익일 사용분은 DEADLINE_PASSED 로 거부된다")
    void sameDayAndPastDeadlineTomorrowAreRejected() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON); // 12:30
        Facility facility = openedFacility();
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        assertThatThrownBy(() -> policy.validateApplication(facility, club, leader, TODAY))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
        assertThatThrownBy(() -> policy.validateApplication(facility, club, leader, TODAY.plusDays(1)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("마감 경계 — 전날 12:00:59에는 신청되고 12:01:00에는 거부된다")
    void deadlineBoundaryIsMinutePrecise() {
        Facility facility = openedFacility();
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        LocalDate tomorrow = TODAY.plusDays(1);
        assertThatCode(() -> policyAt(BOUNDARY_ALLOWED).validateApplication(facility, club, leader, tomorrow))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policyAt(BOUNDARY_REJECTED).validateApplication(facility, club, leader, tomorrow))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 창 밖이면 자격·권한 문제보다 창 오류가 먼저다")
    void windowErrorPrecedesPermissionErrors() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(openedFacility(), general,
                memberOf(general, ClubMemberRole.MEMBER), NEXT_MONTH_END.plusDays(1)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 마감된 날짜면 자격·권한 문제보다 마감 오류가 먼저다")
    void deadlineErrorPrecedesPermissionErrors() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(openedFacility(), general,
                memberOf(general, ClubMemberRole.MEMBER), TODAY))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 날짜가 유효하면 중앙동아리 자격이 역할보다 먼저다")
    void eligibilityErrorPrecedesRoleError() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(openedFacility(), general,
                memberOf(general, ClubMemberRole.MEMBER), LocalDate.of(2026, 1, 12)))
                .isInstanceOf(FacilityBookingException.CentralClubOnlyException.class);
    }

    @Test
    @DisplayName("날짜·자격이 유효한 중앙동아리 일반회원은 PERMISSION_DENIED 로 거부된다")
    void centralClubMemberIsRejectedByRole() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Club club = centralClub();
        assertThatThrownBy(() -> policy.validateApplication(openedFacility(), club,
                memberOf(club, ClubMemberRole.MEMBER), LocalDate.of(2026, 1, 12)))
                .isInstanceOf(FacilityBookingException.PermissionDeniedException.class);
    }

    @Test
    @DisplayName("windowFor 는 시설 오픈일 창을, referenceWindow 는 오픈일과 무관한 참조 창을 준다")
    void windowForUsesFacilityOpenDateWhileReferenceWindowDoesNot() {
        BookingApplicationPolicy policy = policyAt(AFTERNOON);
        Facility facility = facilityWithOpenDate(TODAY.plusDays(5));

        assertThat(policy.windowFor(facility, TODAY))
                .isEqualTo(new BookingWindow(TODAY.plusDays(5), NEXT_MONTH_END));
        assertThat(policy.referenceWindow(TODAY)).isEqualTo(new BookingWindow(TODAY, NEXT_MONTH_END));
    }
}
