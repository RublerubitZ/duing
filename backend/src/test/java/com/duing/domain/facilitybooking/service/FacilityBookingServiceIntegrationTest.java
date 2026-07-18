package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.BookingWindowFixture;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
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
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;

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
        club.changeCentralClub(true); // 시설 예약 신청은 중앙동아리만 가능(설계 spec 2026-07-18)
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
                "정기 합주", 15, FacilityBookingFixture.VALID_CONTACT_PHONE);
    }

    private LocalDate bookableDate() {
        // 시각 무관 항상 신청 가능한 날짜(내일) — 롤링 창은 오늘을 포함하나 고정 슬롯 시각 타임밤을 피해 내일을 쓴다.
        return BookingWindowFixture.bookableDate();
    }

    private void forceStatus(FacilityBooking booking, BookingStatus status) throws Exception {
        Field statusField = FacilityBooking.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(booking, status);
    }

    // ---------- tests ----------

    @Test
    @DisplayName("운영 중이 아닌 동아리는 예약을 신청할 수 없다 — 동아리 행 잠금 하 ACTIVE 재검증")
    void createRejectsInactiveClub() throws Exception {
        User leader = saveUser("리더");
        Club inactiveClub = saveActiveClub("중단동아리");
        clubMemberRepository.save(ClubMember.asLeader(inactiveClub, leader));
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(inactiveClub, ClubStatus.INACTIVE);
        clubRepository.save(inactiveClub);
        Facility facility = saveFacility();

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                inactiveClub.getId(), leader.getId(), facility.getId(), bookableDate(),
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)))
                .isInstanceOf(ClubMemberException.NotActiveClub.class);
        assertThat(bookingRepository.findByClubIdOrderByCreatedAtDesc(inactiveClub.getId())).isEmpty();
    }

    @Test
    @DisplayName("운영 중이 아닌 동아리는 일반 멤버가 신청해도 NotActiveClub 이 먼저 반환된다")
    void createRejectsInactiveClubForMemberBeforeRoleCheck() throws Exception {
        User member = saveUser("일반부원");
        Club inactiveClub = saveActiveClub("중단동아리B");
        clubMemberRepository.save(ClubMember.asMember(inactiveClub, member));
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(inactiveClub, ClubStatus.INACTIVE);
        clubRepository.save(inactiveClub);
        Facility facility = saveFacility();

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                inactiveClub.getId(), member.getId(), facility.getId(), bookableDate(),
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)))
                .isInstanceOf(ClubMemberException.NotActiveClub.class);
        assertThat(bookingRepository.findByClubIdOrderByCreatedAtDesc(inactiveClub.getId())).isEmpty();
    }

    @Test
    @DisplayName("운영진 신청은 PENDING 으로 생성되고 생성 이력이 남는다")
    void createPendingBookingWithHistory() throws Exception {
        Fixture fixture = fixture();

        var result = bookingService.create(command(fixture, bookableDate(), 18, 20));

        FacilityBooking saved = bookingRepository.findById(result.bookingId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(BookingStatus.PENDING);
        assertThat(saved.getContactPhone()).isEqualTo(FacilityBookingFixture.VALID_CONTACT_PHONE);
        assertThat(result.overlappingPendingCount()).isZero();
        var histories = historyRepository.findByBookingIdOrderByCreatedAtDesc(saved.getId());
        assertThat(histories).hasSize(1);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.PENDING);
        assertThat(histories.get(0).getChangedById()).isEqualTo(fixture.leader().getId());
    }

    @Test
    @DisplayName("일반 멤버(비운영진)의 신청은 PERMISSION_DENIED 로 거부된다")
    void rejectNonManagerApplicant() throws Exception {
        Fixture fixture = fixture();
        User member = saveUser("일반부원");
        clubMemberRepository.save(ClubMember.asMember(fixture.club(), member));

        CreateFacilityBookingCommand byMember = new CreateFacilityBookingCommand(
                fixture.club().getId(), member.getId(), fixture.facility().getId(),
                bookableDate(), LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);

        assertThatThrownBy(() -> bookingService.create(byMember))
                .isInstanceOf(FacilityBookingException.PermissionDeniedException.class);
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
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);

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
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);

        assertThatThrownBy(() -> bookingService.create(blocked))
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);

        // CONFIRMED 도 동일하게 차단된다 — 상태 목록에서 CONFIRMED 가 빠지는 회귀를 고정
        // (첫 save 로 version 이 올라갔으므로 stale 인스턴스가 아닌 재조회본에 상태를 강제한다)
        FacilityBooking approvedFirst = bookingRepository.findById(first.getId()).orElseThrow();
        forceStatus(approvedFirst, BookingStatus.CONFIRMED);
        bookingRepository.save(approvedFirst);
        assertThatThrownBy(() -> bookingService.create(blocked))
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);
        // 같은 동아리 재신청도 내부 차단(§5.1 검증 순서상 동아리 중복 검사보다 먼저)에 걸린다
        assertThatThrownBy(() -> bookingService.create(command(fixture, date, 19, 21)))
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);
    }

    @Test
    @DisplayName("타 동아리 운영진이 자기 clubId 로 남의 신청을 취소하면 NotFound 다 (IDOR 차단)")
    void cancelIsScopedToOwnClub() throws Exception {
        Fixture fixture = fixture();
        var result = bookingService.create(command(fixture, bookableDate(), 18, 20));

        User intruderLeader = saveUser("타클럽리더");
        Club intruderClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(intruderClub, intruderLeader));

        // 자기 동아리 운영진 권한은 통과하지만 booking 이 자기 클럽 스코프 밖 → NotFound (존재 여부 비노출)
        assertThatThrownBy(() -> bookingService.cancel(
                intruderClub.getId(), intruderLeader.getId(), result.bookingId()))
                .isInstanceOf(FacilityBookingException.BookingNotFoundException.class);

        FacilityBooking untouched = bookingRepository.findById(result.bookingId()).orElseThrow();
        assertThat(untouched.getStatus()).isEqualTo(BookingStatus.PENDING);
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
                    slotDate, slotStart, slotStart.plusHours(1), "연습 " + index, null,
                    FacilityBookingFixture.VALID_CONTACT_PHONE));
        }

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date.plusDays(2), LocalTime.of(9, 0), LocalTime.of(10, 0), "초과 신청", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)))
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
                fixture.leader().getId(), date, LocalTime.of(18, 0), LocalTime.of(20, 0), "연습", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        forceStatus(first, BookingStatus.APPROVED);
        bookingRepository.saveAndFlush(first);

        FacilityBooking second = FacilityBooking.request(fixture.facility().getId(), fixture.club().getId(),
                fixture.leader().getId(), date, LocalTime.of(19, 0), LocalTime.of(21, 0), "연습2", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        forceStatus(second, BookingStatus.APPROVED);

        assertThatThrownBy(() -> bookingRepository.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("EXCLUDE 제약 — CONFIRMED 와 겹치는 APPROVED 도 DB 가 직접 거부한다 (제약의 CONFIRMED 커버 고정)")
    void excludeConstraintCoversConfirmed() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        FacilityBooking confirmed = FacilityBooking.request(fixture.facility().getId(), fixture.club().getId(),
                fixture.leader().getId(), date, LocalTime.of(18, 0), LocalTime.of(20, 0), "연습", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        forceStatus(confirmed, BookingStatus.CONFIRMED);
        bookingRepository.saveAndFlush(confirmed);

        FacilityBooking overlappingApproved = FacilityBooking.request(fixture.facility().getId(),
                fixture.club().getId(), fixture.leader().getId(), date, LocalTime.of(19, 0), LocalTime.of(21, 0),
                "연습2", null, FacilityBookingFixture.VALID_CONTACT_PHONE);
        forceStatus(overlappingApproved, BookingStatus.APPROVED);

        // 제약 WHERE 절에서 CONFIRMED 가 빠지는 마이그레이션 회귀가 들어오면 이 단언이 깨진다
        assertThatThrownBy(() -> bookingRepository.saveAndFlush(overlappingApproved))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("EXCLUDE 제약 — 경계가 맞닿은(끝==시작) 두 APPROVED 는 겹침이 아니라 저장된다 (반개구간 의미 고정)")
    void excludeConstraintAllowsBoundaryTouch() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        FacilityBooking first = FacilityBooking.request(fixture.facility().getId(), fixture.club().getId(),
                fixture.leader().getId(), date, LocalTime.of(18, 0), LocalTime.of(20, 0), "연습", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        forceStatus(first, BookingStatus.APPROVED);
        bookingRepository.saveAndFlush(first);

        FacilityBooking adjacent = FacilityBooking.request(fixture.facility().getId(), fixture.club().getId(),
                fixture.leader().getId(), date, LocalTime.of(20, 0), LocalTime.of(21, 0), "연습2", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        forceStatus(adjacent, BookingStatus.APPROVED);

        // tsrange 기본 경계 '[)' 가 '[]' 로 바뀌는 회귀가 들어오면 연속 시간대 승인이 전부 409 가 되고 이 단언이 깨진다
        bookingRepository.saveAndFlush(adjacent);
        assertThat(bookingRepository.findById(adjacent.getId()).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("같은 동아리·시설·겹치는 시간의 동시 신청은 한 건만 성공하고 나머지는 동아리 중복으로 실패하며 PENDING 은 1건만 남는다")
    void concurrentSameClubCreateSerializesToSingleSuccess() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        // 같은 동아리·같은 시설·겹치는 시간(18~20 vs 19~21) 두 신청을 2스레드로 동시 실행한다.
        // 무잠금이면 두 PENDING 이 모두 커밋되어 동아리 중복·상한 검사를 우회하지만,
        // 동아리 행 비관 잠금이 create 를 순차화하므로 뒤 신청은 앞의 PENDING 을 보고 중복으로 실패한다.
        CreateFacilityBookingCommand firstCommand = command(fixture, date, 18, 20);
        CreateFacilityBookingCommand secondCommand = command(fixture, date, 19, 21);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> firstTask = () -> tryCreate(firstCommand);
        Callable<Throwable> secondTask = () -> tryCreate(secondCommand);

        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(firstTask, secondTask));
        pool.shutdown();
        boolean finished = pool.awaitTermination(15, TimeUnit.SECONDS);
        assertThat(finished).as("동시성 테스트가 시간 내에 완료").isTrue();

        List<Throwable> results = outcomes.stream().map(this::quietGet).toList();
        long successes = results.stream().filter(throwable -> throwable == null).count();
        assertThat(successes).as("정확히 한 건만 성공").isEqualTo(1);
        assertThat(results.stream().filter(throwable -> throwable != null).toList())
                .as("실패한 한 건은 동아리 중복 예외")
                .singleElement()
                .isInstanceOf(FacilityBookingException.DuplicateClubBookingException.class);

        List<FacilityBooking> pendings = bookingRepository.findByClubIdAndStatusOrderByCreatedAtDesc(
                fixture.club().getId(), BookingStatus.PENDING);
        assertThat(pendings).as("PENDING 은 정확히 1건만 남는다").hasSize(1);
    }

    @Test
    @DisplayName("운영진(OFFICER)도 예약을 신청할 수 있다")
    void officerCanCreateBooking() throws Exception {
        Fixture fixture = fixture();
        User officer = saveUser("운영진");
        clubMemberRepository.save(ClubMember.of(fixture.club(), officer, ClubMemberRole.OFFICER));

        var result = bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), officer.getId(), fixture.facility().getId(),
                bookableDate(), LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 회의", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE));

        assertThat(result.bookingId()).isNotNull();
    }

    @Test
    @DisplayName("일반동아리는 회장이어도 CENTRAL_CLUB_ONLY 로 신청이 거부된다")
    void generalClubIsRejectedByEligibility() throws Exception {
        User leader = saveUser("일반동아리장");
        Club generalClub = saveActiveClub("일반동아리");
        generalClub.changeCentralClub(false);
        clubRepository.save(generalClub);
        clubMemberRepository.save(ClubMember.asLeader(generalClub, leader));
        Facility facility = saveFacility();

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                generalClub.getId(), leader.getId(), facility.getId(), bookableDate(),
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)))
                .isInstanceOfSatisfying(FacilityBookingException.CentralClubOnlyException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_CENTRAL_CLUB_ONLY"));
        assertThat(bookingRepository.findByClubIdOrderByCreatedAtDesc(generalClub.getId())).isEmpty();
    }

    @Test
    @DisplayName("당일 사용 신청은 DEADLINE_PASSED 로 거부된다 — 마감은 사용일 전날 12:00")
    void sameDayBookingIsRejectedByDeadline() throws Exception {
        Fixture fixture = fixture();
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                today, LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)))
                .isInstanceOfSatisfying(FacilityBookingException.DeadlinePassedException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_DEADLINE_PASSED"));
    }

    private Throwable tryCreate(CreateFacilityBookingCommand command) {
        try {
            bookingService.create(command);
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }
}
