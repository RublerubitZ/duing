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
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionAuditEntry;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchListItem;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchSearchCondition;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchStatusFilter;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidateBooking;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GeneralFacilitySubmissionHistoryQueryIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionQueryService queryService;
    @Autowired FacilitySubmissionService submissionService;
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
        club = clubRepository.save(Club.create("이력동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private SubmissionActorContext actor() {
        return new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
    }

    private FacilityBooking approvedBooking(int startHour) {
        return approvedBooking(club, startHour);
    }

    private FacilityBooking approvedBooking(Club bookingClub, int startHour) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), bookingClub.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        return bookingRepository.save(booking);
    }

    @Test
    @DisplayName("제출 이력은 취소된 Batch 를 포함해 최신순으로 반환되고 건수·이름이 채워진다")
    void batchListIncludesCancelledWithNames() {
        FacilityBooking first = approvedBooking(9);
        FacilityBooking second = approvedBooking(11);
        Long olderBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(first.getId()), "1차"), actor()).batchId();
        Long newerBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(second.getId()), "2차"), actor()).batchId();
        submissionService.cancel(olderBatchId, actor());

        Page<SubmissionBatchListItem> page = queryService.getBatches(
                new SubmissionBatchSearchCondition(null, null), PageRequest.of(0, 20));

        assertThat(page.getContent()).extracting(SubmissionBatchListItem::batchId)
                .containsExactly(newerBatchId, olderBatchId);
        SubmissionBatchListItem cancelledRow = page.getContent().get(1);
        assertThat(cancelledRow.cancelled()).isTrue();
        assertThat(cancelledRow.bookingCount()).isEqualTo(1);
        assertThat(cancelledRow.facilityName()).isEqualTo(facility.getRoomName());
        assertThat(cancelledRow.submittedByName()).isEqualTo(admin.getName());
        assertThat(cancelledRow.memo()).isEqualTo("1차");
    }

    @Test
    @DisplayName("facilityId 필터를 주면 해당 시설의 이력만 반환된다")
    void facilityFilterNarrowsBatches() {
        FacilityBooking mine = approvedBooking(9);
        submissionService.create(new CreateSubmissionBatchCommand(List.of(mine.getId()), null), actor());
        Facility otherFacility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(2)", "1504호", 0));

        Page<SubmissionBatchListItem> page = queryService.getBatches(
                new SubmissionBatchSearchCondition(otherFacility.getId(), null), PageRequest.of(0, 20));

        assertThat(page.getContent()).isEmpty();
    }

    @Test
    @DisplayName("status 필터가 파생 상태(진행 중·완료·취소)별로 이력을 나눈다")
    void statusFilterPartitionsBatchesByDerivedState() {
        FacilityBooking reviewingTarget = approvedBooking(9);
        FacilityBooking completedTarget = approvedBooking(11);
        FacilityBooking cancelledTarget = approvedBooking(13);
        Long reviewingBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(reviewingTarget.getId()), null), actor()).batchId();
        Long completedBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(completedTarget.getId()), null), actor()).batchId();
        submissionService.complete(completedBatchId, actor());
        Long cancelledBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(cancelledTarget.getId()), null), actor()).batchId();
        submissionService.cancel(cancelledBatchId, actor());

        assertThat(batchIdsOf(SubmissionBatchStatusFilter.REVIEWING)).containsExactly(reviewingBatchId);
        assertThat(batchIdsOf(SubmissionBatchStatusFilter.COMPLETED)).containsExactly(completedBatchId);
        assertThat(batchIdsOf(SubmissionBatchStatusFilter.CANCELLED)).containsExactly(cancelledBatchId);
        // 무필터는 전 상태를 최신순으로 반환한다(현행 유지).
        assertThat(batchIdsOf(null)).containsExactly(cancelledBatchId, completedBatchId, reviewingBatchId);
    }

    private List<Long> batchIdsOf(SubmissionBatchStatusFilter status) {
        return queryService.getBatches(new SubmissionBatchSearchCondition(facility.getId(), status),
                        PageRequest.of(0, 20)).getContent().stream()
                .map(SubmissionBatchListItem::batchId)
                .toList();
    }

    @Test
    @DisplayName("Batch 상세는 헤더와 예약 목록을 반환하고 조회 감사(VIEWED)를 남긴다")
    void detailReturnsBookingsAndRecordsViewedAudit() {
        FacilityBooking booking = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), "상세 확인"), actor()).batchId();

        SubmissionBatchDetailResult detail = queryService.getDetail(batchId, actor());

        assertThat(detail.batch().batchId()).isEqualTo(batchId);
        assertThat(detail.batch().memo()).isEqualTo("상세 확인");
        assertThat(detail.bookings()).hasSize(1);
        assertThat(detail.bookings().get(0).bookingId()).isEqualTo(booking.getId());
        assertThat(detail.bookings().get(0).submitted()).isTrue();
        assertThat(auditRepository.findByBatchIdOrderByIdAsc(batchId))
                .extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.VIEWED);
    }

    @Test
    @DisplayName("취소된 Batch 도 상세 조회가 가능하고 소속 예약은 이 Batch 에 담긴 것으로 표시된다")
    void cancelledBatchDetailRemainsReadable() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult batch = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.cancel(batch.batchId(), actor());

        SubmissionBatchDetailResult detail = queryService.getDetail(batch.batchId(), actor());

        assertThat(detail.batch().cancelled()).isTrue();
        assertThat(detail.bookings()).hasSize(1);
        assertThat(detail.bookings().get(0).submitted())
                .as("상세는 이 Batch 기준 — 취소 여부는 헤더가 알린다").isTrue();
        assertThat(detail.bookings().get(0).submissionNo()).isEqualTo(batch.submissionNo());
    }

    @Test
    @DisplayName("스킵 후 다른 Batch 에 재제출된 예약도 원래 Batch 상세에서는 미제출로 남고 남의 제출번호가 붙지 않는다")
    void detailScopesSubmissionNoToViewedBatch() {
        FacilityBooking confirmedTarget = approvedBooking(9);
        FacilityBooking skippedTarget = approvedBooking(11);
        CreateSubmissionBatchResult firstBatch = submissionService.create(new CreateSubmissionBatchCommand(
                List.of(confirmedTarget.getId(), skippedTarget.getId()), null), actor());
        FacilityBooking toConflict = bookingRepository.findById(skippedTarget.getId()).orElseThrow();
        toConflict.markConflict("학교 시간표와 충돌");
        bookingRepository.save(toConflict);
        submissionService.complete(firstBatch.batchId(), actor());
        FacilityBooking reapproved = bookingRepository.findById(skippedTarget.getId()).orElseThrow();
        reapproved.approve(admin.getId(), null, LocalDateTime.now());
        bookingRepository.save(reapproved);
        CreateSubmissionBatchResult secondBatch = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(skippedTarget.getId()), null), actor());

        SubmissionBatchDetailResult detail = queryService.getDetail(firstBatch.batchId(), actor());

        SubmissionCandidateBooking skippedRow = detail.bookings().stream()
                .filter(row -> row.bookingId().equals(skippedTarget.getId()))
                .findFirst().orElseThrow();
        assertThat(skippedRow.submissionNo())
                .as("재제출된 Batch(" + secondBatch.submissionNo() + ")의 번호가 새어 나오면 안 된다").isNull();
        assertThat(skippedRow.submitted()).as("이 Batch 에서는 제외된 건").isFalse();
        SubmissionCandidateBooking confirmedRow = detail.bookings().stream()
                .filter(row -> row.bookingId().equals(confirmedTarget.getId()))
                .findFirst().orElseThrow();
        assertThat(confirmedRow.submitted()).isTrue();
        assertThat(confirmedRow.submissionNo()).isEqualTo(firstBatch.submissionNo());
    }

    @Test
    @DisplayName("존재하지 않는 Batch 상세 조회는 404 예외가 발생한다")
    void unknownBatchDetailThrowsNotFound() {
        assertThatThrownBy(() -> queryService.getDetail(999_999L, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);
    }

    @Test
    @DisplayName("이력 행과 상세 헤더에 완료 상태가 노출된다")
    void batchListExposesCompletionState() {
        FacilityBooking booking = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor()).batchId();
        submissionService.complete(batchId, actor());

        Page<SubmissionBatchListItem> page = queryService.getBatches(
                new SubmissionBatchSearchCondition(null, null), PageRequest.of(0, 20));

        assertThat(page.getContent().get(0).completed()).isTrue();
        assertThat(page.getContent().get(0).completedAt()).isNotNull();
        assertThat(page.getContent().get(0).cancelled()).isFalse();
    }

    @Test
    @DisplayName("배치 목록의 각 행에는 포함 동아리명이 중복 없이 가나다순으로 담긴다")
    void 배치_목록_동아리명_집계() {
        Club windClub = clubRepository.save(Club.create("바람", ClubCategory.OTHER, "분과", "설명", null));
        Club gaonClub = clubRepository.save(Club.create("가온", ClubCategory.OTHER, "분과", "설명", null));
        FacilityBooking firstWindBooking = approvedBooking(windClub, 9);
        FacilityBooking secondWindBooking = approvedBooking(windClub, 11);
        FacilityBooking gaonBooking = approvedBooking(gaonClub, 13);
        Long batchId = submissionService.create(new CreateSubmissionBatchCommand(
                List.of(firstWindBooking.getId(), secondWindBooking.getId(), gaonBooking.getId()), null),
                actor()).batchId();

        Page<SubmissionBatchListItem> page = queryService.getBatches(
                new SubmissionBatchSearchCondition(null, null), PageRequest.of(0, 10));

        SubmissionBatchListItem row = page.getContent().stream()
                .filter(listItem -> listItem.batchId().equals(batchId))
                .findFirst().orElseThrow();
        assertThat(row.clubNames()).containsExactly("가온", "바람");
        // 상세 헤더도 같은 기준으로 채워진다(§2 — 대기/이력 어디서 열어도 동일 표기).
        assertThat(queryService.getDetail(batchId, actor()).batch().clubNames())
                .containsExactly("가온", "바람");
    }

    @Test
    @DisplayName("완료 시 스킵된 예약의 동아리도 포함 동아리명에 남는다 — 건수(bookingCount)와 같은 기준")
    void 스킵_항목_동아리_포함() {
        Club skippedClub = clubRepository.save(Club.create("가온", ClubCategory.OTHER, "분과", "설명", null));
        FacilityBooking keptBooking = approvedBooking(9);
        FacilityBooking skippedBooking = approvedBooking(skippedClub, 11);
        Long batchId = submissionService.create(new CreateSubmissionBatchCommand(
                List.of(keptBooking.getId(), skippedBooking.getId()), null), actor()).batchId();
        FacilityBooking toConflict = bookingRepository.findById(skippedBooking.getId()).orElseThrow();
        toConflict.markConflict("학교 시간표와 충돌");
        bookingRepository.save(toConflict);
        submissionService.complete(batchId, actor());

        Page<SubmissionBatchListItem> page = queryService.getBatches(
                new SubmissionBatchSearchCondition(null, null), PageRequest.of(0, 10));

        SubmissionBatchListItem row = page.getContent().stream()
                .filter(listItem -> listItem.batchId().equals(batchId))
                .findFirst().orElseThrow();
        assertThat(row.clubNames()).containsExactly("가온", club.getName());
    }

    @Test
    @DisplayName("상세는 감사 이력을 시간순으로 — 관리자 이름·요약 detail 과 함께 반환한다")
    void detailReturnsAuditTrailWithAdminNamesAndSummary() {
        FacilityBooking booking = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor()).batchId();
        submissionService.complete(batchId, actor());

        SubmissionBatchDetailResult detail = queryService.getDetail(batchId, actor());

        // CREATED → COMPLETED → VIEWED(방금 상세 조회 자신)
        assertThat(detail.audits()).extracting(SubmissionAuditEntry::action)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.COMPLETED,
                        SubmissionAuditAction.VIEWED);
        assertThat(detail.audits().get(0).adminName()).isEqualTo(admin.getName());
        assertThat(detail.audits().get(1).detail()).contains("학교 제출 완료 — 총 1건 / 등록 완료 1건");
        assertThat(detail.audits().get(0).ipAddress()).isEqualTo("127.0.0.1");
        assertThat(detail.batch().completed()).isTrue();
    }
}
