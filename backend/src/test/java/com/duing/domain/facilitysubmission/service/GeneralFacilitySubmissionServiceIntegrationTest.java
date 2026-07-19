package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
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
class GeneralFacilitySubmissionServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilitySubmissionBatchRepository batchRepository;
    @Autowired FacilitySubmissionItemRepository itemRepository;
    @Autowired FacilitySubmissionAuditRepository auditRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime() % 1_000_000);

    private User admin;
    private User applicant;
    private Club club;
    private Facility facility;

    @BeforeEach
    void setUpFixture() {
        admin = userRepository.save(UserFixture.admin());
        applicant = userRepository.save(UserFixture.unique());
        club = clubRepository.save(Club.create("제출동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private SubmissionActorContext actor() {
        return new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
    }

    /** 정책 우회 직접 저장 — 승인 완료 예약. startHour 로 시간 겹침을 피한다. */
    private FacilityBooking approvedBooking(int startHour) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        return bookingRepository.save(booking);
    }

    private FacilityBooking pendingBooking(int startHour) {
        return bookingRepository.save(FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE));
    }

    @Test
    @DisplayName("승인 완료 예약들로 Batch 가 생성되고 번호·CSV 파일명·감사가 남는다")
    void createBatchWithApprovedBookings() {
        FacilityBooking first = approvedBooking(9);
        FacilityBooking second = approvedBooking(11);

        CreateSubmissionBatchResult result = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(second.getId(), first.getId()), "  "), actor());

        assertThat(result.submissionNo()).matches("SUB-\\d{8}-\\d{3}");
        assertThat(result.csvFileName()).isEqualTo("facility-submission-" + result.submissionNo() + ".csv");
        assertThat(batchRepository.findById(result.batchId()).orElseThrow().getMemo())
                .as("공백 메모는 null 로 저장한다").isNull();
        assertThat(itemRepository.findByBatchIdOrderByIdAsc(result.batchId())).hasSize(2);
        List<FacilitySubmissionAudit> audits = auditRepository.findByBatchIdOrderByIdAsc(result.batchId());
        assertThat(audits).hasSize(1);
        assertThat(audits.get(0).getAction()).isEqualTo(SubmissionAuditAction.CREATED);
        assertThat(audits.get(0).getIpAddress()).isEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("승인 완료가 아닌 예약이 하나라도 섞이면 Batch 는 전혀 생성되지 않는다")
    void nonApprovedBookingRejectsWholeBatch() {
        FacilityBooking approved = approvedBooking(9);
        FacilityBooking pending = pendingBooking(11);

        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(approved.getId(), pending.getId()), null), actor()))
                .isInstanceOf(FacilitySubmissionException.BookingNotApprovedException.class);
        assertThat(batchRepository.count()).isZero();
        assertThat(itemRepository.count()).isZero();
    }

    @Test
    @DisplayName("이미 제출된 예약이 포함되면 거부된다")
    void alreadySubmittedBookingRejects() {
        FacilityBooking booking = approvedBooking(9);
        submissionService.create(new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());

        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor()))
                .isInstanceOf(FacilitySubmissionException.AlreadySubmittedBookingException.class);
    }

    @Test
    @DisplayName("다른 시설의 예약이 섞이면 거부된다")
    void mixedFacilityRejects() {
        FacilityBooking mine = approvedBooking(9);
        Facility otherFacility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(2)", "1504호", 0));
        FacilityBooking other = FacilityBooking.request(
                otherFacility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(13, 0), LocalTime.of(14, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        other.approve(admin.getId(), null, LocalDateTime.now());
        bookingRepository.save(other);

        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(mine.getId(), other.getId()), null), actor()))
                .isInstanceOf(FacilitySubmissionException.MixedFacilityException.class);
    }

    @Test
    @DisplayName("존재하지 않는 예약 ID 가 섞이면 거부된다")
    void unknownBookingIdRejects() {
        FacilityBooking booking = approvedBooking(9);

        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId(), 999_999L), null), actor()))
                .isInstanceOf(FacilitySubmissionException.SubmissionBookingNotFoundException.class);
    }

    @Test
    @DisplayName("빈 선택으로는 Batch 를 만들 수 없다")
    void emptySelectionRejects() {
        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(), null), actor()))
                .isInstanceOf(FacilitySubmissionException.EmptyBookingSelectionException.class);
    }

    @Test
    @DisplayName("제출 취소는 booking 을 건드리지 않고 감사를 남기며, 취소 후 같은 예약을 다시 제출할 수 있다")
    void cancelKeepsBookingAndAllowsResubmission() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult firstResult = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());

        submissionService.cancel(firstResult.batchId(), actor());

        assertThat(batchRepository.findById(firstResult.batchId()).orElseThrow().isCancelled()).isTrue();
        assertThat(bookingRepository.findById(booking.getId()).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
        assertThat(auditRepository.findByBatchIdOrderByIdAsc(firstResult.batchId()))
                .extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.CANCELLED);

        CreateSubmissionBatchResult secondResult = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        assertThat(secondResult.batchId()).isNotEqualTo(firstResult.batchId());
    }

    @Test
    @DisplayName("이미 취소된 Batch 를 다시 취소하면 409 예외가 발생한다")
    void cancellingTwiceThrowsConflict() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult result = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.cancel(result.batchId(), actor());

        assertThatThrownBy(() -> submissionService.cancel(result.batchId(), actor()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCancelledException.class);
    }

    @Test
    @DisplayName("존재하지 않는 Batch 취소는 404 예외가 발생한다")
    void cancellingUnknownBatchThrowsNotFound() {
        assertThatThrownBy(() -> submissionService.cancel(999_999L, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);
    }
}
