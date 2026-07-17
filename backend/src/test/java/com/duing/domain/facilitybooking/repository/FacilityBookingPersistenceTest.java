package com.duing.domain.facilitybooking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingPersistenceTest extends IntegrationTestBase {

    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingStatusHistoryRepository historyRepository;
    @Autowired FacilityBookingPurposePresetRepository presetRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private FacilityBooking saveBooking(Long facilityId, Long clubId, Long applicantId,
                                        LocalDate date, int startHour, int endHour) {
        return bookingRepository.save(FacilityBooking.request(facilityId, clubId, applicantId,
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 연습", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE));
    }

    private Long saveFixtures() {
        // 반환: facilityId. club/user 는 테스트에서 getId 로 재사용.
        Facility facility = facilityRepository.save(
                Facility.create((int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
        return facility.getId();
    }

    private User saveUser() {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L), "부원" + unique, "hashed",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
                "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveClub() {
        return clubRepository.save(Club.create("동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
    }

    @Test
    @DisplayName("겹침 조회는 시간이 교차하는 지정 상태의 신청만 반환하고 경계 접촉은 제외한다")
    void findOverlappingReturnsIntersectingBookingsOnly() {
        Long facilityId = saveFixtures();
        Club club = saveClub();
        User applicant = saveUser();
        LocalDate date = LocalDate.now().plusDays(3);

        FacilityBooking target = saveBooking(facilityId, club.getId(), applicant.getId(), date, 18, 20);
        saveBooking(facilityId, club.getId(), applicant.getId(), date, 20, 21); // 경계 접촉 — 제외
        saveBooking(facilityId, club.getId(), applicant.getId(), date.plusDays(1), 18, 20); // 다른 날짜 — 제외

        List<FacilityBooking> overlapping = bookingRepository.findOverlapping(
                facilityId, date, List.of(BookingStatus.PENDING), LocalTime.of(19, 0), LocalTime.of(20, 0));

        assertThat(overlapping).extracting(FacilityBooking::getId).containsExactly(target.getId());
    }

    @Test
    @DisplayName("이력은 booking_id 로 최신순 조회되고 changedBy·previousStatus 가 null 인 행(시스템/생성)도 저장된다")
    void historyRoundTrip() {
        Long facilityId = saveFixtures();
        Club club = saveClub();
        User applicant = saveUser();
        FacilityBooking booking = saveBooking(facilityId, club.getId(), applicant.getId(),
                LocalDate.now().plusDays(3), 18, 20);

        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), null, BookingStatus.PENDING, applicant.getId(), null, null));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), BookingStatus.PENDING, BookingStatus.CANCELLED, null, "시스템 처리", null));

        List<FacilityBookingStatusHistory> histories =
                historyRepository.findByBookingIdOrderByCreatedAtDesc(booking.getId());

        assertThat(histories).hasSize(2);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(histories.get(0).getChangedById()).isNull();
        assertThat(histories.get(1).getPreviousStatus()).isNull();
    }

    @Test
    @DisplayName("Preset 시드 9종이 active·sort_order 순으로 조회된다")
    void presetSeedIsServedInOrder() {
        var presets = presetRepository.findByActiveTrueOrderBySortOrderAsc();
        assertThat(presets).hasSize(9);
        assertThat(presets.get(0).getLabel()).isEqualTo("동아리 정기 모임");
        assertThat(presets.get(8).getLabel()).isEqualTo("촬영");
    }

    @Test
    @DisplayName("동아리 활성 상태 집계는 지정 상태만 센다")
    void countByClubIdAndStatusIn() {
        Long facilityId = saveFixtures();
        Club club = saveClub();
        User applicant = saveUser();
        LocalDate date = LocalDate.now().plusDays(3);
        saveBooking(facilityId, club.getId(), applicant.getId(), date, 9, 10);
        FacilityBooking cancelled = saveBooking(facilityId, club.getId(), applicant.getId(), date, 10, 11);
        cancelled.cancelByClub();
        bookingRepository.save(cancelled);

        long active = bookingRepository.countByClubIdAndStatusIn(club.getId(),
                List.of(BookingStatus.PENDING, BookingStatus.APPROVED));

        assertThat(active).isEqualTo(1);
    }
}
