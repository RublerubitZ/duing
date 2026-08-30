package com.duing.domain.facilitysubmission.repository;

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
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilitySubmissionPersistenceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionBatchRepository batchRepository;
    @Autowired FacilitySubmissionItemRepository itemRepository;
    @Autowired FacilitySubmissionAuditRepository auditRepository;
    @Autowired UserRepository userRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityBookingRepository bookingRepository;

    @Test
    @DisplayName("제출 Batch·Item·Audit 이 스키마와 일치하게 저장·조회된다")
    void batchItemAuditPersistAndLoad() {
        User admin = userRepository.save(UserFixture.admin());
        Facility facility = facilityRepository.save(Facility.create(90001, "커뮤니티룸(1)", "1503호", 0));
        Club club = clubRepository.save(Club.create("제출동아리", ClubCategory.OTHER, "분과", "설명", null));
        FacilityBooking booking = bookingRepository.save(FacilityBooking.request(
                facility.getId(), club.getId(), admin.getId(),
                LocalDate.now().plusDays(3), LocalTime.of(18, 0), LocalTime.of(20, 0),
                "정기 연습", null, FacilityBookingFixture.VALID_CONTACT_PHONE));

        FacilitySubmissionBatch savedBatch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-001", club.getId(), admin.getId(), LocalDateTime.now(), "8월 1차 제출"));
        FacilitySubmissionItem savedItem = itemRepository.save(
                FacilitySubmissionItem.of(savedBatch.getId(), booking.getId()));
        FacilitySubmissionAudit savedAudit = auditRepository.save(FacilitySubmissionAudit.of(
                savedBatch.getId(), SubmissionAuditAction.CREATED, admin.getId(), "127.0.0.1", "JUnit"));

        FacilitySubmissionBatch foundBatch = batchRepository.findById(savedBatch.getId()).orElseThrow();
        assertThat(foundBatch.getSubmissionNo()).isEqualTo("SUB-20260801-001");
        assertThat(foundBatch.getClubId()).isEqualTo(club.getId());
        assertThat(foundBatch.getFacilityId()).as("동아리 단위 전환 후 신규 배치는 시설을 갖지 않는다").isNull();
        assertThat(foundBatch.getCsvFileName()).isEqualTo("facility-submission-SUB-20260801-001.csv");
        assertThat(foundBatch.isCancelled()).isFalse();
        assertThat(itemRepository.findById(savedItem.getId()).orElseThrow().getBookingId())
                .isEqualTo(booking.getId());
        assertThat(auditRepository.findById(savedAudit.getId()).orElseThrow().getAction())
                .isEqualTo(SubmissionAuditAction.CREATED);
    }

    @Test
    @DisplayName("취소된 Batch 도 조회에서 사라지지 않고 취소 상태로 남는다")
    void cancelledBatchRemainsVisible() {
        User admin = userRepository.save(UserFixture.admin());
        Club club = clubRepository.save(Club.create("제출동아리-2", ClubCategory.OTHER, "분과", "설명", null));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-002", club.getId(), admin.getId(), LocalDateTime.now(), null));

        batch.cancel(admin.getId(), LocalDateTime.now());
        batchRepository.save(batch);

        FacilitySubmissionBatch found = batchRepository.findById(batch.getId()).orElseThrow();
        assertThat(found.isCancelled()).isTrue();
        assertThat(found.getCancelledById()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("이미 취소된 Batch 를 다시 취소하면 예외가 발생한다")
    void cancellingTwiceThrows() {
        User admin = userRepository.save(UserFixture.admin());
        Club club = clubRepository.save(Club.create("제출동아리-3", ClubCategory.OTHER, "분과", "설명", null));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-003", club.getId(), admin.getId(), LocalDateTime.now(), null));
        batch.cancel(admin.getId(), LocalDateTime.now());

        assertThatThrownBy(() -> batch.cancel(admin.getId(), LocalDateTime.now()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCancelledException.class);
    }

    @Test
    @DisplayName("501자 User-Agent 로도 Audit 저장이 컬럼 길이 초과 없이 성공한다")
    void oversizedUserAgentIsTruncated() {
        User admin = userRepository.save(UserFixture.admin());
        Club club = clubRepository.save(Club.create("제출동아리-4", ClubCategory.OTHER, "분과", "설명", null));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-004", club.getId(), admin.getId(), LocalDateTime.now(), null));

        FacilitySubmissionAudit saved = auditRepository.save(FacilitySubmissionAudit.of(
                batch.getId(), SubmissionAuditAction.VIEWED, admin.getId(), "127.0.0.1", "A".repeat(501)));

        assertThat(auditRepository.findById(saved.getId()).orElseThrow().getUserAgent()).hasSize(500);
    }

    @Test
    @DisplayName("완료 처리된 Batch 는 완료 시각·처리자와 함께 저장되고 감사 detail 도 함께 남는다")
    void completedBatchPersistsWithDetailAudit() {
        User admin = userRepository.save(UserFixture.admin());
        Club club = clubRepository.save(Club.create("제출동아리-5", ClubCategory.OTHER, "분과", "설명", null));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-005", club.getId(), admin.getId(), LocalDateTime.now(), null));

        batch.complete(admin.getId(), LocalDateTime.now());
        batchRepository.save(batch);
        FacilitySubmissionAudit savedAudit = auditRepository.save(FacilitySubmissionAudit.of(
                batch.getId(), SubmissionAuditAction.COMPLETED, admin.getId(), "127.0.0.1", "JUnit",
                "학교 제출 완료 — 총 1건 / 등록 완료 1건"));

        FacilitySubmissionBatch found = batchRepository.findById(batch.getId()).orElseThrow();
        assertThat(found.isCompleted()).isTrue();
        assertThat(found.getCompletedById()).isEqualTo(admin.getId());
        assertThat(auditRepository.findById(savedAudit.getId()).orElseThrow().getDetail())
                .isEqualTo("학교 제출 완료 — 총 1건 / 등록 완료 1건");
    }

    @Test
    @DisplayName("완료된 Batch 는 취소할 수 없고, 완료·취소는 각각 중복 처리가 거부된다")
    void completionAndCancellationAreMutuallyExclusive() {
        User admin = userRepository.save(UserFixture.admin());
        Club club = clubRepository.save(Club.create("제출동아리-6", ClubCategory.OTHER, "분과", "설명", null));
        FacilitySubmissionBatch completed = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-006", club.getId(), admin.getId(), LocalDateTime.now(), null));
        completed.complete(admin.getId(), LocalDateTime.now());

        assertThatThrownBy(() -> completed.cancel(admin.getId(), LocalDateTime.now()))
                .isInstanceOf(FacilitySubmissionException.CompletedBatchUncancellableException.class);
        assertThatThrownBy(() -> completed.complete(admin.getId(), LocalDateTime.now()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCompletedException.class);

        FacilitySubmissionBatch cancelled = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-007", club.getId(), admin.getId(), LocalDateTime.now(), null));
        cancelled.cancel(admin.getId(), LocalDateTime.now());
        assertThatThrownBy(() -> cancelled.complete(admin.getId(), LocalDateTime.now()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCancelledException.class);
    }

    @Test
    @DisplayName("501자 감사 detail 은 500자로 절단되어 저장된다")
    void oversizedAuditDetailIsTruncated() {
        User admin = userRepository.save(UserFixture.admin());
        Club club = clubRepository.save(Club.create("제출동아리-8", ClubCategory.OTHER, "분과", "설명", null));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-008", club.getId(), admin.getId(), LocalDateTime.now(), null));

        FacilitySubmissionAudit saved = auditRepository.save(FacilitySubmissionAudit.of(
                batch.getId(), SubmissionAuditAction.COMPLETED, admin.getId(), "127.0.0.1", "JUnit",
                "가".repeat(501)));

        assertThat(auditRepository.findById(saved.getId()).orElseThrow().getDetail()).hasSize(500);
    }
}
