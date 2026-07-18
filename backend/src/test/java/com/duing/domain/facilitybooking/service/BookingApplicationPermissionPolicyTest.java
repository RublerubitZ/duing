package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingApplicationPermissionPolicyTest {

    private final ClubEligibilityPolicy eligibilityPolicy = new ClubEligibilityPolicy();
    private final BookingRolePolicy rolePolicy = new BookingRolePolicy();

    private static Club centralClub() {
        return Club.create("중앙동아리", ClubCategory.OTHER, "분과", "설명", null, true, null);
    }

    private static Club generalClub() {
        return Club.create("일반동아리", ClubCategory.OTHER, "분과", "설명", null);
    }

    @Test
    @DisplayName("중앙동아리는 신청 자격이 있고 일반동아리는 CENTRAL_CLUB_ONLY 로 거부된다")
    void onlyCentralClubIsEligible() {
        assertThatCode(() -> eligibilityPolicy.validate(centralClub())).doesNotThrowAnyException();
        assertThatThrownBy(() -> eligibilityPolicy.validate(generalClub()))
                .isInstanceOfSatisfying(FacilityBookingException.CentralClubOnlyException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_CENTRAL_CLUB_ONLY"));
    }

    @Test
    @DisplayName("회장과 운영진은 신청할 수 있고 일반회원은 PERMISSION_DENIED 로 거부된다")
    void onlyLeaderAndOfficerCanApply() {
        Club club = centralClub();
        assertThatCode(() -> rolePolicy.validate(
                ClubMember.of(club, UserFixture.unique(), ClubMemberRole.LEADER))).doesNotThrowAnyException();
        assertThatCode(() -> rolePolicy.validate(
                ClubMember.of(club, UserFixture.unique(), ClubMemberRole.OFFICER))).doesNotThrowAnyException();
        assertThatThrownBy(() -> rolePolicy.validate(
                ClubMember.of(club, UserFixture.unique(), ClubMemberRole.MEMBER)))
                .isInstanceOfSatisfying(FacilityBookingException.PermissionDeniedException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_PERMISSION_DENIED"));
    }
}
