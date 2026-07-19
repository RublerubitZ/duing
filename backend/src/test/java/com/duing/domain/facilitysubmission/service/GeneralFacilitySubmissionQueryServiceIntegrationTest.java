package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidateBooking;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GeneralFacilitySubmissionQueryServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionQueryService queryService;
    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime() % 1_000_000);

    private User admin;
    private User applicant;
    private Club club;
    private Facility facility;
    private final LocalDate baseDate = LocalDate.now().plusDays(7);

    @BeforeEach
    void setUpFixture() {
        admin = userRepository.save(UserFixture.admin());
        applicant = userRepository.save(UserFixture.unique());
        club = clubRepository.save(Club.create("조회동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private SubmissionCandidatesQuery periodQuery() {
        return new SubmissionCandidatesQuery(facility.getId(), baseDate.minusDays(1), baseDate.plusDays(1), null);
    }

    private FacilityBooking savedBooking(int startHour, BookingStatus targetStatus) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), baseDate,
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        if (targetStatus != BookingStatus.PENDING) {
            booking.approve(admin.getId(), null, LocalDateTime.now());
        }
        if (targetStatus == BookingStatus.CONFIRMED) {
            booking.confirmManually(LocalDateTime.now());
        }
        if (targetStatus == BookingStatus.REJECTED) {
            // reject 는 PENDING 에서만 가능 — 새로 만들어 reject 한다
            booking = FacilityBooking.request(
                    facility.getId(), club.getId(), applicant.getId(), baseDate,
                    LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                    "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
            booking.reject(admin.getId(), "사유", LocalDateTime.now());
        }
        return bookingRepository.save(booking);
    }

    @Test
    @DisplayName("기간 내 전체 예약이 반환되고 REJECTED 만 제외되며 submitted·selectable 이 정확히 파생된다")
    void candidatesDeriveFlagsAndExcludeRejected() {
        FacilityBooking pending = savedBooking(9, BookingStatus.PENDING);
        FacilityBooking awaiting = savedBooking(11, BookingStatus.APPROVED);
        FacilityBooking submitted = savedBooking(13, BookingStatus.APPROVED);
        FacilityBooking confirmed = savedBooking(15, BookingStatus.CONFIRMED);
        savedBooking(17, BookingStatus.REJECTED);
        String submissionNo = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(submitted.getId()), null),
                new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit")).submissionNo();

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.bookings()).extracting(SubmissionCandidateBooking::bookingId)
                .containsExactly(pending.getId(), awaiting.getId(), submitted.getId(), confirmed.getId());
        SubmissionCandidateBooking awaitingRow = result.bookings().get(1);
        assertThat(awaitingRow.submitted()).isFalse();
        assertThat(awaitingRow.selectable()).isTrue();
        assertThat(awaitingRow.clubName()).isEqualTo(club.getName());
        assertThat(awaitingRow.applicantName()).isEqualTo(applicant.getName());
        assertThat(awaitingRow.decidedByName()).isEqualTo(admin.getName());
        SubmissionCandidateBooking submittedRow = result.bookings().get(2);
        assertThat(submittedRow.submitted()).isTrue();
        assertThat(submittedRow.selectable()).isFalse();
        assertThat(submittedRow.submissionNo()).isEqualTo(submissionNo);
        SubmissionCandidateBooking pendingRow = result.bookings().get(0);
        assertThat(pendingRow.selectable()).isFalse();
        assertThat(pendingRow.submissionNo()).isNull();
    }

    @Test
    @DisplayName("취소된 Batch 소속 예약은 다시 제출 대기(selectable)로 집계된다")
    void cancelledBatchBookingBecomesSelectableAgain() {
        FacilityBooking booking = savedBooking(9, BookingStatus.APPROVED);
        SubmissionActorContext actor = new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor).batchId();
        submissionService.cancel(batchId, actor);

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.bookings().get(0).submitted()).isFalse();
        assertThat(result.bookings().get(0).selectable()).isTrue();
        assertThat(result.summary().awaitingCount()).isEqualTo(1);
        assertThat(result.summary().submittedCount()).isZero();
    }

    @Test
    @DisplayName("summary 4개 값이 동일 필터 범위에서 정확히 집계된다")
    void summaryCountsMatchDefinition() {
        savedBooking(9, BookingStatus.PENDING);
        savedBooking(11, BookingStatus.APPROVED);
        FacilityBooking submitted = savedBooking(13, BookingStatus.APPROVED);
        savedBooking(15, BookingStatus.CONFIRMED);
        submissionService.create(new CreateSubmissionBatchCommand(List.of(submitted.getId()), null),
                new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit"));

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.summary().approvedCount()).as("APPROVED 전체(제출 여부 무관)").isEqualTo(2);
        assertThat(result.summary().awaitingCount()).as("APPROVED + 미제출").isEqualTo(1);
        assertThat(result.summary().submittedCount()).as("활성 Batch 소속").isEqualTo(1);
        assertThat(result.summary().confirmedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("clubId 필터를 주면 해당 동아리 예약만 반환된다")
    void clubFilterNarrowsBookings() {
        savedBooking(9, BookingStatus.APPROVED);
        Club otherClub = clubRepository.save(Club.create("타동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        FacilityBooking otherBooking = FacilityBooking.request(
                facility.getId(), otherClub.getId(), applicant.getId(), baseDate,
                LocalTime.of(11, 0), LocalTime.of(12, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        bookingRepository.save(otherBooking);

        SubmissionCandidatesResult result = queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate.minusDays(1), baseDate.plusDays(1), otherClub.getId()));

        assertThat(result.bookings()).hasSize(1);
        assertThat(result.bookings().get(0).clubId()).isEqualTo(otherClub.getId());
    }

    @Test
    @DisplayName("조회 기간이 31일을 넘거나 역순이면 400 예외가 발생한다")
    void invalidPeriodRejects() {
        assertThatThrownBy(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate, baseDate.plusDays(31), null)))
                .isInstanceOf(FacilitySubmissionException.InvalidCandidatePeriodException.class);
        assertThatThrownBy(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate, baseDate.minusDays(1), null)))
                .isInstanceOf(FacilitySubmissionException.InvalidCandidatePeriodException.class);
        assertThatCode(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate, baseDate.plusDays(30), null)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("제출 후 관리자 취소된 예약은 목록에 CANCELLED 로 남고 제출됨으로 집계된다")
    void cancelledAfterSubmissionStaysListedAsSubmitted() {
        FacilityBooking booking = savedBooking(9, BookingStatus.APPROVED);
        String submissionNo = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null),
                new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit")).submissionNo();
        FacilityBooking reloaded = bookingRepository.findById(booking.getId()).orElseThrow();
        reloaded.cancelByAdmin();
        bookingRepository.save(reloaded);

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.bookings()).extracting(SubmissionCandidateBooking::bookingId)
                .contains(booking.getId());
        SubmissionCandidateBooking row = result.bookings().stream()
                .filter(candidate -> candidate.bookingId().equals(booking.getId()))
                .findFirst().orElseThrow();
        assertThat(row.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(row.submitted()).isTrue();
        assertThat(row.selectable()).isFalse();
        assertThat(row.submissionNo()).isEqualTo(submissionNo);
        assertThat(result.summary().submittedCount()).isEqualTo(1);
        assertThat(result.summary().approvedCount()).isZero();
    }

    @Test
    @DisplayName("CONFLICT 상태 예약도 목록에 포함되고 선택은 불가하다")
    void conflictBookingIsListedButNotSelectable() {
        FacilityBooking booking = savedBooking(9, BookingStatus.APPROVED);
        booking.markConflict("학교 중복");
        bookingRepository.save(booking);

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.bookings()).extracting(SubmissionCandidateBooking::bookingId)
                .contains(booking.getId());
        SubmissionCandidateBooking row = result.bookings().stream()
                .filter(candidate -> candidate.bookingId().equals(booking.getId()))
                .findFirst().orElseThrow();
        assertThat(row.status()).isEqualTo(BookingStatus.CONFLICT);
        assertThat(row.submitted()).isFalse();
        assertThat(row.selectable()).isFalse();
    }
}
