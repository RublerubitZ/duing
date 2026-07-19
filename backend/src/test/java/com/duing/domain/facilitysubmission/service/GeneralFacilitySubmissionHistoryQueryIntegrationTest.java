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
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchListItem;
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
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
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

        Page<SubmissionBatchListItem> page = queryService.getBatches(null, PageRequest.of(0, 20));

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

        Page<SubmissionBatchListItem> page = queryService.getBatches(otherFacility.getId(), PageRequest.of(0, 20));

        assertThat(page.getContent()).isEmpty();
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
    @DisplayName("취소된 Batch 도 상세 조회가 가능하고 소속 예약은 미제출 상태로 표시된다")
    void cancelledBatchDetailRemainsReadable() {
        FacilityBooking booking = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor()).batchId();
        submissionService.cancel(batchId, actor());

        SubmissionBatchDetailResult detail = queryService.getDetail(batchId, actor());

        assertThat(detail.batch().cancelled()).isTrue();
        assertThat(detail.bookings()).hasSize(1);
        assertThat(detail.bookings().get(0).submitted())
                .as("활성 제출 기준 재계산 — 취소된 Batch 소속은 미제출").isFalse();
    }

    @Test
    @DisplayName("존재하지 않는 Batch 상세 조회는 404 예외가 발생한다")
    void unknownBatchDetailThrowsNotFound() {
        assertThatThrownBy(() -> queryService.getDetail(999_999L, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);
    }
}
