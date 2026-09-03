package com.duing.global.file.purge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.global.file.FileStorageService;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * {@link UploadPurgeJob} 통합 테스트(FederationInquiryPurgeJobTest 패턴). FileStorageService 는 외부 경계라
 * {@link MockitoBean} 으로 대체한다 — mock 의 boolean 기본값은 false(=삭제 미확정)이므로 파기가 일어나야 하는
 * 테스트는 반드시 {@code stubStorageDeleteConfirmed()} 로 명시 stub 한다.
 *
 * <p>이슈 #791 테스트 케이스 4 "이미 삭제된 객체 처리 멱등성" 은 별도 케이스가 아니다 — S3/Local 구현 계약상
 * 미존재 키 delete 도 true(삭제 확정)이므로 정상 경로(mock delete→true)와 동형이다.
 *
 * <p>컨텍스트는 enabled=true 라 @EnableScheduling 이 켜져 매시 :20 에 실제 크론이 돌 수 있다 — delete-enabled=false
 * (dry-run)라 로그만 남기므로 테스트 결과에 영향이 없다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.upload.purge.enabled=true",
        "duing.upload.purge.delete-enabled=false",
        "duing.upload.purge.window=PT24H"
})
class UploadPurgeJobTest extends IntegrationTestBase {

    @Autowired UploadPurgeJob dryRunJob; // 컨텍스트 빈 = delete-enabled=false
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired Clock clock;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired PlatformTransactionManager platformTransactionManager;
    @MockitoBean FileStorageService fileStorageService;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private UploadPurgeJob deleteEnabledJob() {
        return new UploadPurgeJob(new UploadPurgeProperties(true, true, Duration.ofHours(24)),
                clock, uploadedObjectRepository, fileStorageService, platformTransactionManager);
    }

    private void stubStorageDeleteConfirmed() {
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> "resolved:" + invocation.getArgument(0, String.class));
        when(fileStorageService.delete(anyString())).thenReturn(true);
    }

    private String seed(UploadedObjectStatus status, int hoursAgo) {
        String storageKey = "club/logo/" + sequence.incrementAndGet() + ".jpg";
        Instant uploadedAt = Instant.now(clock).minus(hoursAgo, ChronoUnit.HOURS);
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, uploadedAt);
        if (status == UploadedObjectStatus.ACTIVE) uploadedObject.activate(uploadedAt);
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        uploadedObjectRepository.save(uploadedObject);
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("dry-run(기본)에서는 25시간 지난 PENDING 이 있어도 스토리지를 지우지 않고 상태도 바꾸지 않는다")
    void dryRunNeverDeletesNorChangesStatus() {
        stubStorageDeleteConfirmed();
        String oldKey = seed(UploadedObjectStatus.PENDING, 25);
        String referencedKey = seed(UploadedObjectStatus.PENDING, 25);
        clubRepository.save(Club.create("참조클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명",
                "https://files.example.com/" + referencedKey));

        dryRunJob.run();

        verify(fileStorageService, never()).delete(anyString());
        assertThat(statusOf(oldKey)).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(statusOf(referencedKey)).isEqualTo(UploadedObjectStatus.PENDING);
    }

    @Test
    @DisplayName("실삭제 모드에서 25시간 지난 PENDING 은 스토리지 삭제 후 PURGED 가 되고, 1시간 지난 PENDING 과 오래된 ACTIVE 는 건드리지 않는다")
    void deletesOnlyExpiredPending() {
        stubStorageDeleteConfirmed();
        String expiredKey = seed(UploadedObjectStatus.PENDING, 25);
        String recentKey = seed(UploadedObjectStatus.PENDING, 1);
        String activeKey = seed(UploadedObjectStatus.ACTIVE, 500);

        deleteEnabledJob().run();

        assertThat(statusOf(expiredKey)).isEqualTo(UploadedObjectStatus.PURGED);
        assertThat(uploadedObjectRepository.findByStorageKey(expiredKey).orElseThrow().getPurgedAt()).isNotNull();
        verify(fileStorageService).delete("resolved:" + expiredKey);
        verify(fileStorageService, times(1)).delete(anyString());
        assertThat(statusOf(recentKey)).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(statusOf(activeKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("실삭제 모드라도 어떤 엔티티가 아직 참조하는 후보는 지우지 않고 ACTIVE 로 치유한다 (활성화 지점 누락 안전망)")
    void healsReferencedCandidateInsteadOfDeleting() {
        stubStorageDeleteConfirmed();
        String referencedKey = seed(UploadedObjectStatus.PENDING, 25);
        clubRepository.save(Club.create("참조클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명",
                "https://files.example.com/" + referencedKey));

        deleteEnabledJob().run();

        assertThat(statusOf(referencedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        verify(fileStorageService, never()).delete(anyString());
    }

    @Test
    @DisplayName("스토리지 delete 가 false(미확정)면 PURGING 으로 남고, 다음 실행에서 재시도해 확정되면 PURGED 가 된다")
    void keepsPurgingOnUnconfirmedDeleteAndRetriesNextRun() {
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> "resolved:" + invocation.getArgument(0, String.class));
        String failingKey = seed(UploadedObjectStatus.PENDING, 25);
        String okKey = seed(UploadedObjectStatus.PENDING, 25);
        when(fileStorageService.delete("resolved:" + failingKey)).thenReturn(false);
        when(fileStorageService.delete("resolved:" + okKey)).thenReturn(true);

        deleteEnabledJob().run();
        assertThat(statusOf(failingKey)).isEqualTo(UploadedObjectStatus.PURGING);
        assertThat(statusOf(okKey)).isEqualTo(UploadedObjectStatus.PURGED);

        when(fileStorageService.delete("resolved:" + failingKey)).thenReturn(true);
        deleteEnabledJob().run();
        assertThat(statusOf(failingKey)).isEqualTo(UploadedObjectStatus.PURGED);
        verify(fileStorageService, times(2)).delete("resolved:" + failingKey);
        verify(fileStorageService, times(1)).delete("resolved:" + okKey);
    }

    @Test
    @DisplayName("스토리지 delete 가 예외를 던져도(방어 경로) 그 후보는 PURGING 으로 남고 나머지 후보는 계속 파기된다")
    void keepsPurgingOnStorageExceptionAndContinuesOthers() {
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> "resolved:" + invocation.getArgument(0, String.class));
        String throwingKey = seed(UploadedObjectStatus.PENDING, 25);
        String nextKey = seed(UploadedObjectStatus.PENDING, 25);
        doThrow(new RuntimeException("스토리지 장애")).when(fileStorageService).delete("resolved:" + throwingKey);
        when(fileStorageService.delete("resolved:" + nextKey)).thenReturn(true);

        deleteEnabledJob().run();

        assertThat(statusOf(throwingKey)).isEqualTo(UploadedObjectStatus.PURGING);
        assertThat(statusOf(nextKey)).isEqualTo(UploadedObjectStatus.PURGED);
    }

    @Test
    @DisplayName("2회 실행해도 두 번째 실행은 이미 PURGED 된 객체를 다시 지우지 않는다 (멱등·중복 실행 안전)")
    void isIdempotentAcrossRuns() {
        stubStorageDeleteConfirmed();
        String expiredKey = seed(UploadedObjectStatus.PENDING, 25);

        deleteEnabledJob().run();
        deleteEnabledJob().run();

        assertThat(statusOf(expiredKey)).isEqualTo(UploadedObjectStatus.PURGED);
        verify(fileStorageService, times(1)).delete(anyString());
    }

    @Test
    @DisplayName("한 번에 최대 500건만 처리하고 남은 후보는 다음 실행이 이어받는다")
    void processesAtMostBatchLimitPerRun() {
        stubStorageDeleteConfirmed();
        Instant uploadedAt = Instant.now(clock).minus(25, ChronoUnit.HOURS);
        List<Object[]> rows = new ArrayList<>();
        for (int index = 0; index < 502; index++) {
            rows.add(new Object[]{"club/logo/bulk-" + sequence.incrementAndGet() + ".jpg", "LOGO", 1L, "PENDING",
                    java.sql.Timestamp.from(uploadedAt)});
        }
        jdbcTemplate.batchUpdate(
                "INSERT INTO uploaded_object (storage_key, purpose, uploader_id, status, uploaded_at) VALUES (?, ?, ?, ?, ?)",
                rows);

        deleteEnabledJob().run();
        Integer purgedAfterFirst = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE status = 'PURGED'", Integer.class);
        assertThat(purgedAfterFirst).isEqualTo(500);

        deleteEnabledJob().run();
        Integer purgedAfterSecond = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE status = 'PURGED'", Integer.class);
        assertThat(purgedAfterSecond).isEqualTo(502);
    }

    @Test
    @DisplayName("enabled=false 잡과 window=0 잡은 25시간 지난 PENDING 도 건드리지 않는다 (비활성·오설정 안전장치)")
    void noopWhenDisabledOrWindowIsZero() {
        stubStorageDeleteConfirmed();
        String expiredKey = seed(UploadedObjectStatus.PENDING, 25);

        new UploadPurgeJob(new UploadPurgeProperties(false, true, Duration.ofHours(24)),
                clock, uploadedObjectRepository, fileStorageService, platformTransactionManager).run();
        new UploadPurgeJob(new UploadPurgeProperties(true, true, Duration.ZERO),
                clock, uploadedObjectRepository, fileStorageService, platformTransactionManager).run();

        assertThat(statusOf(expiredKey)).isEqualTo(UploadedObjectStatus.PENDING);
        verify(fileStorageService, never()).delete(anyString());
    }
}
