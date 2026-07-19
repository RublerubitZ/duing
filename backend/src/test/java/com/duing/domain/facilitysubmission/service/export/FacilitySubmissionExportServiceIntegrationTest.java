package com.duing.domain.facilitysubmission.service.export;

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
import com.duing.domain.facilitysubmission.service.FacilitySubmissionService;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.nio.charset.StandardCharsets;
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
class FacilitySubmissionExportServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionExportService exportService;
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
        club = clubRepository.save(Club.create("내보내기동아리-" + sequence.getAndIncrement(),
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
    @DisplayName("CSV Export 는 Batch 파일명·본문을 반환하고 다운로드 감사를 남긴다")
    void csvExportReturnsFileAndRecordsAudit() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), "비고 메모"), actor());

        ExportFile exportFile = exportService.export(created.batchId(), ExportFormat.CSV, actor());

        assertThat(exportFile.fileName()).isEqualTo(created.csvFileName());
        assertThat(exportFile.contentType()).isEqualTo("text/csv;charset=UTF-8");
        String csvText = new String(exportFile.content(), StandardCharsets.UTF_8);
        assertThat(csvText).contains(created.submissionNo());
        assertThat(csvText).contains(club.getName());
        assertThat(csvText).contains(applicant.getName());
        assertThat(csvText).contains("비고 메모");
        assertThat(auditRepository.findByBatchIdOrderByIdAsc(created.batchId()))
                .extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.CSV_DOWNLOADED);
    }

    @Test
    @DisplayName("취소된 Batch 도 이력 확인용 CSV 재다운로드가 가능하다")
    void cancelledBatchStillExports() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.cancel(created.batchId(), actor());

        ExportFile exportFile = exportService.export(created.batchId(), ExportFormat.CSV, actor());

        assertThat(exportFile.content()).isNotEmpty();
    }

    @Test
    @DisplayName("존재하지 않는 Batch Export 는 404 예외가 발생한다")
    void unknownBatchExportThrowsNotFound() {
        assertThatThrownBy(() -> exportService.export(999_999L, ExportFormat.CSV, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);
    }
}
