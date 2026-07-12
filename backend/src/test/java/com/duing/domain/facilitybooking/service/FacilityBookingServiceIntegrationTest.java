package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingStatusHistoryRepository historyRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ---------- fixtures (ApplicationStatusConcurrencyTest 패턴) ----------

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L), name + unique, "hashed",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
                "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Facility saveFacility() {
        return facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private record Fixture(User leader, Club club, Facility facility) {}

    private Fixture fixture() throws Exception {
        User leader = saveUser("리더");
        Club club = saveActiveClub("대관동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return new Fixture(leader, club, saveFacility());
    }

    private CreateFacilityBookingCommand command(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return new CreateFacilityBookingCommand(fixture.club().getId(), fixture.leader().getId(),
                fixture.facility().getId(), date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0),
                "정기 합주", 15);
    }

    private LocalDate bookableDate() {
        // 오늘+3 은 항상 미래이면서 다음 달 말일 이내다(현재월의 어느 날이든 다음 달 말일까지 최소 4주 여유)
        return LocalDate.now().plusDays(3);
    }

    private void forceStatus(FacilityBooking booking, BookingStatus status) throws Exception {
        Field statusField = FacilityBooking.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(booking, status);
    }

    // ---------- tests ----------

    @Test
    @DisplayName("운영진 신청은 PENDING 으로 생성되고 생성 이력이 남는다")
    void createPendingBookingWithHistory() throws Exception {
        Fixture fixture = fixture();

        var result = bookingService.create(command(fixture, bookableDate(), 18, 20));

        FacilityBooking saved = bookingRepository.findById(result.bookingId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(BookingStatus.PENDING);
        assertThat(result.overlappingPendingCount()).isZero();
        var histories = historyRepository.findByBookingIdOrderByCreatedAtDesc(saved.getId());
        assertThat(histories).hasSize(1);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.PENDING);
        assertThat(histories.get(0).getChangedById()).isEqualTo(fixture.leader().getId());
    }

    @Test
    @DisplayName("일반 멤버(비운영진)의 신청은 AccessDenied 다")
    void rejectNonManagerApplicant() throws Exception {
        Fixture fixture = fixture();
        User member = saveUser("일반부원");
        clubMemberRepository.save(ClubMember.asMember(fixture.club(), member));

        CreateFacilityBookingCommand byMember = new CreateFacilityBookingCommand(
                fixture.club().getId(), member.getId(), fixture.facility().getId(),
                bookableDate(), LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null);

        assertThatThrownBy(() -> bookingService.create(byMember))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("크롤 점유행과 겹치면 409, 운영행과 겹치는 것은 허용된다")
    void schoolOccupiedBlocksButOperatingAllows() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        // 점유행(꼬리 없음): 18~19 — schedule_seq 는 전역 UNIQUE 라 증가 시퀀스로 발급
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), "비호응원단", null, null, LocalDateTime.now()));
        // 운영행(꼬리 있음): 마커 9~10, 운영 09~20
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                LocalTime.of(9, 0), LocalTime.of(20, 0), LocalDateTime.now()));

        assertThatThrownBy(() -> bookingService.create(command(fixture, date, 18, 20)))
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);

        var allowed = bookingService.create(command(fixture, date, 9, 11)); // 운영행 마커 시간과 겹쳐도 OK
        assertThat(allowed.bookingId()).isNotNull();
    }

    @Test
    @DisplayName("타 동아리 PENDING 과 겹치는 신청은 허용되고 overlappingPendingCount 가 잡힌다")
    void pendingOverlapIsAllowedWithWarningCount() throws Exception {
        Fixture first = fixture();
        LocalDate date = bookableDate();
        bookingService.create(command(first, date, 18, 20));

        User otherLeader = saveUser("리더B");
        Club otherClub = saveActiveClub("다른동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        CreateFacilityBookingCommand overlapping = new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), first.facility().getId(),
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null);

        var result = bookingService.create(overlapping);

        assertThat(result.overlappingPendingCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("내부 APPROVED 와 겹치면 409, 같은 동아리 중복 신청도 409 다")
    void internalBlockAndClubDuplicate() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        var firstResult = bookingService.create(command(fixture, date, 18, 20));
        FacilityBooking first = bookingRepository.findById(firstResult.bookingId()).orElseThrow();

        // 같은 동아리가 겹치는 시간 재신청 → DuplicateClubBooking
        assertThatThrownBy(() -> bookingService.create(command(fixture, date, 19, 21)))
                .isInstanceOf(FacilityBookingException.DuplicateClubBookingException.class);

        // 다른 동아리는 first 가 APPROVED 가 되면 차단된다
        forceStatus(first, BookingStatus.APPROVED);
        bookingRepository.save(first);
        User otherLeader = saveUser("리더C");
        Club otherClub = saveActiveClub("차단동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        CreateFacilityBookingCommand blocked = new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), fixture.facility().getId(),
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null);

        assertThatThrownBy(() -> bookingService.create(blocked))
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);
    }

    @Test
    @DisplayName("활성 신청 10건 상한을 넘는 신청은 거부된다")
    void activeCapIsEnforced() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        for (int index = 0; index < 10; index++) {
            // 같은 동아리 겹침 차단을 피해 날짜 2일 × 시간 5칸(9·11·13·15·17시)으로 분산해 상한 10건을 채운다
            LocalDate slotDate = index < 5 ? date : date.plusDays(1);
            LocalTime slotStart = LocalTime.of(9 + (index % 5) * 2, 0);
            bookingService.create(new CreateFacilityBookingCommand(
                    fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                    slotDate, slotStart, slotStart.plusHours(1), "연습 " + index, null));
        }

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date.plusDays(2), LocalTime.of(9, 0), LocalTime.of(10, 0), "초과 신청", null)))
                .isInstanceOf(FacilityBookingException.ActiveBookingLimitExceededException.class);
    }

    @Test
    @DisplayName("PENDING 취소는 CANCELLED + 이력, PENDING 이 아니면 409 다")
    void cancelPendingOnly() throws Exception {
        Fixture fixture = fixture();
        var result = bookingService.create(command(fixture, bookableDate(), 18, 20));

        bookingService.cancel(fixture.club().getId(), fixture.leader().getId(), result.bookingId());

        FacilityBooking cancelled = bookingRepository.findById(result.bookingId()).orElseThrow();
        assertThat(cancelled.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(result.bookingId())).hasSize(2);

        assertThatThrownBy(() -> bookingService.cancel(
                fixture.club().getId(), fixture.leader().getId(), result.bookingId()))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("EXCLUDE 제약 — 겹치는 두 APPROVED 는 DB 가 직접 거부한다 (승인 로직 우회 백스톱)")
    void excludeConstraintBlocksOverlappingApproved() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        FacilityBooking first = FacilityBooking.request(fixture.facility().getId(), fixture.club().getId(),
                fixture.leader().getId(), date, LocalTime.of(18, 0), LocalTime.of(20, 0), "연습", null);
        forceStatus(first, BookingStatus.APPROVED);
        bookingRepository.saveAndFlush(first);

        FacilityBooking second = FacilityBooking.request(fixture.facility().getId(), fixture.club().getId(),
                fixture.leader().getId(), date, LocalTime.of(19, 0), LocalTime.of(21, 0), "연습2", null);
        forceStatus(second, BookingStatus.APPROVED);

        assertThatThrownBy(() -> bookingRepository.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
