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
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CompleteSubmissionBatchResult;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
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
class GeneralFacilitySubmissionServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilitySubmissionQueryService queryService;
    @Autowired FacilitySubmissionBatchRepository batchRepository;
    @Autowired FacilitySubmissionItemRepository itemRepository;
    @Autowired FacilitySubmissionAuditRepository auditRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingStatusHistoryRepository historyRepository;
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
    @DisplayName("같은 동아리라면 다른 시설의 예약도 한 Batch 로 제출할 수 있고 배치는 동아리를 갖는다")
    void sameClubMultiFacilitySucceeds() {
        FacilityBooking firstFacilityBooking = approvedBooking(9);
        Facility otherFacility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(2)", "1504호", 0));
        FacilityBooking otherFacilityBooking = FacilityBooking.request(
                otherFacility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(13, 0), LocalTime.of(14, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        otherFacilityBooking.approve(admin.getId(), null, LocalDateTime.now());
        bookingRepository.save(otherFacilityBooking);

        CreateSubmissionBatchResult result = submissionService.create(new CreateSubmissionBatchCommand(
                List.of(firstFacilityBooking.getId(), otherFacilityBooking.getId()), null), actor());

        FacilitySubmissionBatch batch = batchRepository.findById(result.batchId()).orElseThrow();
        assertThat(batch.getClubId()).isEqualTo(club.getId());
        assertThat(batch.getFacilityId()).as("동아리 단위 전환 후 신규 배치는 시설을 갖지 않는다").isNull();
        assertThat(itemRepository.findByBatchIdOrderByIdAsc(result.batchId())).hasSize(2);
    }

    @Test
    @DisplayName("서로 다른 동아리의 예약을 섞으면 Batch 는 전혀 생성되지 않고 400 예외가 발생한다")
    void mixedClubRejects() {
        FacilityBooking myClubBooking = approvedBooking(9);
        Club otherClub = clubRepository.save(Club.create("제출동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        FacilityBooking otherClubBooking = FacilityBooking.request(
                facility.getId(), otherClub.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(13, 0), LocalTime.of(14, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        otherClubBooking.approve(admin.getId(), null, LocalDateTime.now());
        bookingRepository.save(otherClubBooking);

        assertThatThrownBy(() -> submissionService.create(new CreateSubmissionBatchCommand(
                List.of(myClubBooking.getId(), otherClubBooking.getId()), null), actor()))
                .isInstanceOf(FacilitySubmissionException.MixedClubException.class);
        assertThat(batchRepository.count()).isZero();
        assertThat(itemRepository.count()).isZero();
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

    @Test
    @DisplayName("완료 처리는 APPROVED 예약을 CONFIRMED 로 전이하고 이력·감사 요약을 남긴다")
    void completeConfirmsApprovedBookingsWithHistoryAndAudit() {
        FacilityBooking first = approvedBooking(9);
        FacilityBooking second = approvedBooking(11);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(first.getId(), second.getId()), null), actor());

        CompleteSubmissionBatchResult result = submissionService.complete(created.batchId(), actor());

        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.confirmedCount()).isEqualTo(2);
        assertThat(result.completedAt()).isNotNull();
        assertThat(result.skippedBookings()).isEmpty();
        assertThat(bookingRepository.findById(first.getId()).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
        assertThat(batchRepository.findById(created.batchId()).orElseThrow().isCompleted()).isTrue();
        List<FacilitySubmissionAudit> audits = auditRepository.findByBatchIdOrderByIdAsc(created.batchId());
        assertThat(audits).extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.COMPLETED);
        assertThat(audits.get(1).getDetail()).isEqualTo("학교 제출 완료 — 총 2건 / 등록 완료 2건");
        FacilityBookingStatusHistory confirmationHistory = historyRepository
                .findByBookingIdOrderByCreatedAtDesc(first.getId()).stream()
                .filter(history -> history.getNewStatus() == BookingStatus.CONFIRMED)
                .findFirst().orElseThrow();
        assertThat(confirmationHistory.getReason()).isEqualTo("학교 제출 완료 — " + created.submissionNo());
        assertThat(confirmationHistory.getChangedById()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("검토 중 상태가 변한 예약은 스킵되고 응답·감사에 사유가 나열된다")
    void completeSkipsChangedBookingsWithReasons() {
        FacilityBooking kept = approvedBooking(9);
        FacilityBooking cancelledOne = approvedBooking(11);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(kept.getId(), cancelledOne.getId()), null), actor());
        FacilityBooking toCancel = bookingRepository.findById(cancelledOne.getId()).orElseThrow();
        toCancel.cancelByAdmin();
        bookingRepository.save(toCancel);

        CompleteSubmissionBatchResult result = submissionService.complete(created.batchId(), actor());

        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.confirmedCount()).isEqualTo(1);
        assertThat(result.skippedBookings()).hasSize(1);
        assertThat(result.skippedBookings().get(0).bookingId()).isEqualTo(cancelledOne.getId());
        assertThat(result.skippedBookings().get(0).status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(result.skippedBookings().get(0).reason()).isEqualTo("취소됨");
        List<FacilitySubmissionAudit> audits = auditRepository.findByBatchIdOrderByIdAsc(created.batchId());
        assertThat(audits.get(1).getDetail())
                .isEqualTo("학교 제출 완료 — 총 2건 / 등록 완료 1건 / 제외 1건: 예약 #"
                        + cancelledOne.getId() + "(취소됨)");
    }

    @Test
    @DisplayName("완료 처리 후에도 후보 조회의 제출함 파생은 유지되고 예약은 등록 완료로 집계된다")
    void candidatesDerivationSurvivesCompletion() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());

        submissionService.complete(created.batchId(), actor());

        SubmissionCandidatesResult candidates = queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), LocalDate.now().plusDays(6), LocalDate.now().plusDays(8), null));
        assertThat(candidates.bookings().get(0).submitted()).isTrue();
        assertThat(candidates.bookings().get(0).selectable()).isFalse();
        assertThat(candidates.summary().submittedCount()).isEqualTo(1);
        assertThat(candidates.summary().confirmedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("완료 시 제외된 예약은 재승인 후 다시 제출할 수 있고, 확정된 예약은 계속 재제출이 막힌다")
    void skippedBookingIsReleasedWhileConfirmedStaysBlocked() {
        FacilityBooking confirmedTarget = approvedBooking(9);
        FacilityBooking conflictTarget = approvedBooking(11);
        CreateSubmissionBatchResult firstBatch = submissionService.create(new CreateSubmissionBatchCommand(
                List.of(confirmedTarget.getId(), conflictTarget.getId()), null), actor());
        FacilityBooking toConflict = bookingRepository.findById(conflictTarget.getId()).orElseThrow();
        toConflict.markConflict("학교 시간표와 충돌");
        bookingRepository.save(toConflict);

        CompleteSubmissionBatchResult completion = submissionService.complete(firstBatch.batchId(), actor());

        assertThat(completion.skippedBookings())
                .extracting(CompleteSubmissionBatchResult.SkippedBooking::bookingId)
                .containsExactly(conflictTarget.getId());
        List<FacilitySubmissionItem> items = itemRepository.findByBatchIdOrderByIdAsc(firstBatch.batchId());
        assertThat(items).as("제외된 예약도 배치 이력에는 그대로 남는다").hasSize(2);
        assertThat(items).filteredOn(item -> item.getBookingId().equals(conflictTarget.getId()))
                .allMatch(item -> item.getSkippedAt() != null);
        assertThat(items).filteredOn(item -> item.getBookingId().equals(confirmedTarget.getId()))
                .allMatch(item -> item.getSkippedAt() == null);
        assertThat(itemRepository.findActiveByBookingIdIn(List.of(confirmedTarget.getId())))
                .as("대조군 — 확정된 예약은 여전히 활성 제출로 잡혀 재제출이 막힌다").hasSize(1);

        FacilityBooking reapproved = bookingRepository.findById(conflictTarget.getId()).orElseThrow();
        reapproved.approve(admin.getId(), null, LocalDateTime.now());
        bookingRepository.save(reapproved);

        assertThat(itemRepository.findActiveByBookingIdIn(List.of(conflictTarget.getId())))
                .as("제외된 예약은 더 이상 활성 제출로 잡히지 않는다").isEmpty();
        CreateSubmissionBatchResult secondBatch = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(conflictTarget.getId()), null), actor());
        submissionService.complete(secondBatch.batchId(), actor());
        assertThat(bookingRepository.findById(conflictTarget.getId()).orElseThrow().getStatus())
                .as("재제출된 예약은 최종적으로 등록 완료에 도달한다").isEqualTo(BookingStatus.CONFIRMED);
    }

    @Test
    @DisplayName("취소된 Batch 완료·미존재 Batch 완료·완료된 Batch 취소는 각각 거부된다")
    void completeGuardsAreEnforced() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult cancelledBatch = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.cancel(cancelledBatch.batchId(), actor());
        assertThatThrownBy(() -> submissionService.complete(cancelledBatch.batchId(), actor()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCancelledException.class);

        assertThatThrownBy(() -> submissionService.complete(999_999L, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);

        CreateSubmissionBatchResult completedBatch = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.complete(completedBatch.batchId(), actor());
        assertThatThrownBy(() -> submissionService.cancel(completedBatch.batchId(), actor()))
                .isInstanceOf(FacilitySubmissionException.CompletedBatchUncancellableException.class);
        assertThatThrownBy(() -> submissionService.complete(completedBatch.batchId(), actor()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCompletedException.class);
    }
}
