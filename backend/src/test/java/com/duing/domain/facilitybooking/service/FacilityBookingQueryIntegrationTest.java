package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.BookingWindowFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingQueryIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityRepository facilityRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leader;
    private Club club;
    private Facility facility;

    @BeforeEach
    void setUpFixture() throws Exception {
        long unique = sequence.getAndIncrement();
        leader = userRepository.save(User.create(String.format("%010d", unique % 10_000_000_000L),
                "리더" + unique, "hashed", UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
        Club created = Club.create("조회동아리-" + unique, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        club = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        facility = facilityRepository.save(Facility.create((int) (unique % 100_000), "커뮤니티룸(Q)", null, 0));
    }

    private Long createBooking(int startHour, int endHour) {
        // 반월 오픈 정책이 계산한 현재 창의 첫 날짜 — 실행 시점과 무관하게 항상 신청 가능하다.
        return bookingService.create(new CreateFacilityBookingCommand(club.getId(), leader.getId(),
                facility.getId(), BookingWindowFixture.firstBookableDate(), LocalTime.of(startHour, 0),
                LocalTime.of(endHour, 0), "정기 연습", null)).bookingId();
    }

    @Test
    @DisplayName("목록은 최신순으로 내려오고 status 필터·시설명이 반영된다")
    void listBookingsWithFilter() {
        Long first = createBooking(9, 10);
        Long second = createBooking(11, 12);
        bookingService.cancel(club.getId(), leader.getId(), first);

        var all = bookingService.getBookings(club.getId(), leader.getId(), null);
        assertThat(all).hasSize(2);
        assertThat(all.get(0).bookingId()).isEqualTo(second);
        assertThat(all.get(0).roomName()).isEqualTo("커뮤니티룸(Q)");

        var cancelled = bookingService.getBookings(club.getId(), leader.getId(), BookingStatus.CANCELLED);
        assertThat(cancelled).singleElement()
                .satisfies(summary -> assertThat(summary.bookingId()).isEqualTo(first));
    }

    @Test
    @DisplayName("상세는 이력을 최신순으로 포함하고, 남의 동아리 신청 조회는 NotFound 다")
    void detailIncludesHistoryAndIsClubScoped() throws Exception {
        Long bookingId = createBooking(14, 16);
        bookingService.cancel(club.getId(), leader.getId(), bookingId);

        var detail = bookingService.getBooking(club.getId(), leader.getId(), bookingId);
        assertThat(detail.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(detail.history()).hasSize(2);
        assertThat(detail.history().get(0).newStatus()).isEqualTo(BookingStatus.CANCELLED);

        // 다른 동아리 운영진이 이 신청을 조회하면 NotFound (club 스코프)
        long unique = sequence.getAndIncrement();
        User otherLeader = userRepository.save(User.create(String.format("%010d", unique % 10_000_000_000L),
                "타리더" + unique, "hashed", UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
        Club otherCreated = Club.create("타동아리-" + unique, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(otherCreated, ClubStatus.ACTIVE);
        Club otherClub = clubRepository.save(otherCreated);
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));

        assertThatThrownBy(() -> bookingService.getBooking(otherClub.getId(), otherLeader.getId(), bookingId))
                .isInstanceOf(FacilityBookingException.BookingNotFoundException.class);
    }
}
