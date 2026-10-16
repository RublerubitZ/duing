package com.duing.domain.club.thumbnail.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ImageFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubService;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.thumbnail.config.ClubLogoThumbnailAsyncConfig;
import com.duing.domain.club.thumbnail.event.ClubLogoChangedEvent;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.FilePurpose;
import com.duing.global.file.FileStorageService;
import com.duing.global.file.UploadedObjectService;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import com.duing.global.frontend.FrontendRevalidationAsyncConfig;
import com.duing.global.frontend.FrontendRevalidator;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 로고 썸네일 생성·반영(스펙 §4.3·§4.4)의 통합 계약. 생성은 직접 호출로 검증하고(실행기에 기대지 않는다), 커밋 뒤 배선(AFTER_COMMIT →
 * 전용 실행기)은 마지막 두 테스트가 DB 조건을 기한 안에서 폴링해 확인한다 — 실행기를 비운 직후 단언하면 작업이 큐에서 빠진 뒤 worker 가
 * 잡기 전의 활성 0·큐 0 순간에 거짓 실패한다. 스토리지는 test 프로파일의 StubFileStorageService — uploadBytes 로 넣은 바이트를
 * download 가 그대로 돌려줘 실제 이미지로 돈다. 상세 재생성 요청기만 목이다(외부 경계, ClubPublicPageRevalidationIntegrationTest
 * 와 같은 컨텍스트).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ExtendWith(OutputCaptureExtension.class)
class ClubLogoThumbnailServiceTest extends IntegrationTestBase {

    private static final long ASYNC_WAIT_MS = 5_000;
    private static final long QUIET_WAIT_MS = 700;
    private static final String STUB_PREFIX = "/files/stub/";
    private static final String PNG_THUMBNAIL_URL_PATTERN = "/files/stub/club/logo/[0-9a-f-]{36}-thumb\\.png";

    @MockitoBean FrontendRevalidator frontendRevalidator;

    @Autowired ClubLogoThumbnailService clubLogoThumbnailService;
    @Autowired ClubService clubService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired UploadedObjectService uploadedObjectService;
    @Autowired FileStorageService fileStorageService;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired PlatformTransactionManager platformTransactionManager;
    @Autowired ApplicationEventPublisher eventPublisher;
    @Autowired @Qualifier(ClubLogoThumbnailAsyncConfig.EXECUTOR_BEAN_NAME) ThreadPoolTaskExecutor thumbnailExecutor;
    @Autowired @Qualifier(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME) ThreadPoolTaskExecutor revalidationExecutor;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void drainAndReset() throws InterruptedException {
        drain(thumbnailExecutor);
        drain(revalidationExecutor);
        clearInvocations(frontendRevalidator);
    }

    /** 이 클래스가 남긴 비동기 생성·재생성이 다음 테스트(같은 컨텍스트를 쓰는 다른 클래스 포함)로 새지 않게 끝에서도 비운다. */
    @AfterEach
    void drainAfter() throws InterruptedException {
        drain(thumbnailExecutor);
        drain(revalidationExecutor);
    }

    private static void drain(ThreadPoolTaskExecutor executor) throws InterruptedException {
        awaitWithin(() -> executor.getActiveCount() == 0 && executor.getQueueSize() == 0);
    }

    /** 조건이 참이 될 때까지 최대 ASYNC_WAIT_MS 폴링한다 — 비동기 결과는 실행기 상태가 아니라 DB 조건으로 기다린다. */
    private static void awaitWithin(BooleanSupplier condition) throws InterruptedException {
        long deadline = System.currentTimeMillis() + ASYNC_WAIT_MS;
        while (!condition.getAsBoolean() && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }

    /** 실제 이미지(또는 임의 바이트)를 스텁 스토리지의 club/logo 키에 넣고 그 공개 URL 을 돌려준다. */
    private String seedLogo(byte[] content, String extension) {
        String storageKey = FilePurpose.LOGO.directory() + "/" + sequence.incrementAndGet() + "." + extension;
        String contentType = "jpg".equals(extension) ? "image/jpeg" : "image/" + extension;
        return fileStorageService.uploadBytes(storageKey, content, contentType);
    }

    private Club saveClub(ClubStatus status, String logoUrl) throws Exception {
        Club club = Club.create("썸네일서비스-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", logoUrl);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        return clubRepository.save(club);
    }

    // 폐쇄(soft-delete)된 행도 읽어야 해서 SQL 로 본다.
    private String thumbnailUrlOf(Long clubId) {
        return jdbcTemplate.queryForObject("SELECT logo_thumbnail_url FROM club WHERE id = ?", String.class, clubId);
    }

    private long thumbnailTrackingRowCount() {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM uploaded_object WHERE storage_key LIKE '%-thumb.%'", Long.class);
    }

    private UploadedObject trackingRowOf(String fileUrl) {
        return uploadedObjectRepository.findByStorageKey(fileStorageService.toStorageKey(fileUrl)).orElseThrow();
    }

    private BufferedImage downloadImage(String fileUrl) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(
                fileStorageService.download(fileStorageService.toStorageKey(fileUrl)).stream().readAllBytes()));
    }

    // UpdateClubCommand 29개 컴포넌트 — 7번째 logoUrl 만 채운다.
    private static UpdateClubCommand logoUpdate(Long clubId, Long requesterId, String logoUrl) {
        return new UpdateClubCommand(
                clubId, requesterId,
                null, null, null, null, logoUrl, null,
                null, null, null,
                null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, null, null, null, null);
    }

    @Test
    @DisplayName("큰 알파 PNG 로고의 썸네일은 club/logo 아래 새 UUID-thumb.png 로 저장되고, 동아리와 ACTIVE 추적 행(업로더=로고 바꾼 사용자)에 반영되며 상세 재생성을 요청한다")
    void storesPngThumbnailAndRequestsDetailRevalidation() throws Exception {
        String logoUrl = seedLogo(ImageFixture.png(800, 600, true), "png");
        Club club = saveClub(ClubStatus.ACTIVE, logoUrl);

        LogoThumbnailOutcome outcome = clubLogoThumbnailService.generateAfterLogoChange(club.getId(), logoUrl, 42L);

        assertThat(outcome).isEqualTo(LogoThumbnailOutcome.STORED);
        String thumbnailUrl = thumbnailUrlOf(club.getId());
        assertThat(thumbnailUrl).matches(PNG_THUMBNAIL_URL_PATTERN);
        BufferedImage thumbnail = downloadImage(thumbnailUrl);
        assertThat(thumbnail.getWidth()).isEqualTo(384);
        assertThat(thumbnail.getHeight()).isEqualTo(288);
        UploadedObject tracked = trackingRowOf(thumbnailUrl);
        assertThat(tracked.getStatus()).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(tracked.getPurpose()).isEqualTo(FilePurpose.LOGO);
        assertThat(tracked.getUploaderId()).isEqualTo(42L);
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS)).revalidateWithoutAlert("/clubs/" + club.getId());
    }

    @Test
    @DisplayName("알파 없는 큰 JPEG 로고의 썸네일은 -thumb.jpg 로 저장된다")
    void storesJpegThumbnailForOpaqueLogo() throws Exception {
        String logoUrl = seedLogo(ImageFixture.jpeg(1000, 500), "jpg");
        Club club = saveClub(ClubStatus.ACTIVE, logoUrl);

        clubLogoThumbnailService.generateAfterLogoChange(club.getId(), logoUrl, 42L);

        String thumbnailUrl = thumbnailUrlOf(club.getId());
        assertThat(thumbnailUrl).matches("/files/stub/club/logo/[0-9a-f-]{36}-thumb\\.jpg");
        assertThat(downloadImage(thumbnailUrl).getWidth()).isEqualTo(384);
        assertThat(downloadImage(thumbnailUrl).getHeight()).isEqualTo(192);
    }

    @Test
    @DisplayName("원본 긴 변이 384 이하이면 원본 URL 을 썸네일로 넣고 새 객체·추적 행은 만들지 않되 상세 재생성은 요청한다")
    void smallLogoReusesOriginalUrlWithoutTrackingRow() throws Exception {
        String logoUrl = seedLogo(ImageFixture.png(300, 200, false), "png");
        Club club = saveClub(ClubStatus.ACTIVE, logoUrl);

        LogoThumbnailOutcome outcome = clubLogoThumbnailService.generateAfterLogoChange(club.getId(), logoUrl, 42L);

        assertThat(outcome).isEqualTo(LogoThumbnailOutcome.STORED);
        assertThat(thumbnailUrlOf(club.getId())).isEqualTo(logoUrl);
        assertThat(thumbnailTrackingRowCount()).isZero();
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS)).revalidateWithoutAlert("/clubs/" + club.getId());
    }

    @Test
    @DisplayName("백필 경로는 썸네일을 똑같이 반영하되 상세 재생성 이벤트를 내지 않고 추적 행 업로더는 시스템 표식 0 이다")
    void backfillPathStoresWithoutDetailRevalidation() throws Exception {
        String logoUrl = seedLogo(ImageFixture.png(800, 600, true), "png");
        Club club = saveClub(ClubStatus.ACTIVE, logoUrl);

        LogoThumbnailOutcome outcome = clubLogoThumbnailService.generateForBackfill(club.getId(), logoUrl);

        assertThat(outcome).isEqualTo(LogoThumbnailOutcome.STORED);
        String thumbnailUrl = thumbnailUrlOf(club.getId());
        assertThat(thumbnailUrl).matches(PNG_THUMBNAIL_URL_PATTERN);
        assertThat(trackingRowOf(thumbnailUrl).getUploaderId()).isEqualTo(ClubLogoThumbnailService.SYSTEM_UPLOADER_ID);
        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    @Test
    @DisplayName("자기 스토리지가 아닌 URL·없는 객체·읽을 수 없는 바이트는 건너뛰어 썸네일이 NULL 로 남고 상세 재생성을 요청하지 않는다")
    void unusableSourcesAreSkipped() throws Exception {
        Club externalLogoClub = saveClub(ClubStatus.ACTIVE, "https://cdn.example.test/logo.png");
        Club missingObjectClub = saveClub(ClubStatus.ACTIVE,
                STUB_PREFIX + "club/logo/__missing__-" + sequence.incrementAndGet() + ".png");
        Club unreadableClub = saveClub(ClubStatus.ACTIVE,
                seedLogo("not an image".getBytes(StandardCharsets.UTF_8), "png"));

        assertThat(clubLogoThumbnailService.generateAfterLogoChange(externalLogoClub.getId(), externalLogoClub.getLogoUrl(), 42L))
                .isEqualTo(LogoThumbnailOutcome.SKIPPED);
        assertThat(clubLogoThumbnailService.generateAfterLogoChange(missingObjectClub.getId(), missingObjectClub.getLogoUrl(), 42L))
                .isEqualTo(LogoThumbnailOutcome.SKIPPED);
        assertThat(clubLogoThumbnailService.generateAfterLogoChange(unreadableClub.getId(), unreadableClub.getLogoUrl(), 42L))
                .isEqualTo(LogoThumbnailOutcome.SKIPPED);

        assertThat(thumbnailUrlOf(externalLogoClub.getId())).isNull();
        assertThat(thumbnailUrlOf(missingObjectClub.getId())).isNull();
        assertThat(thumbnailUrlOf(unreadableClub.getId())).isNull();
        assertThat(thumbnailTrackingRowCount()).isZero();
        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    @Test
    @DisplayName("빈 문자열·공백뿐인 로고 URL 은 예외 없이 건너뛰어 업로드·추적 행 없이 썸네일이 NULL 로 남고 상세 재생성을 요청하지 않는다")
    void blankLogoUrlsAreSkippedWithoutSideEffects() throws Exception {
        // 업로드가 없음을 직접 보려고 같은 스텁을 감싼 스파이로 서비스를 하나 더 만든다 — 빈 교체가 아니라 컨텍스트는 그대로다.
        FileStorageService observedStorage = spy(fileStorageService);
        ClubLogoThumbnailService observedService = new ClubLogoThumbnailService(
                clubRepository, observedStorage, uploadedObjectService, eventPublisher, platformTransactionManager);
        Club emptyLogoClub = saveClub(ClubStatus.ACTIVE, "");
        Club blankLogoClub = saveClub(ClubStatus.ACTIVE, "   ");

        assertThat(observedService.generateAfterLogoChange(emptyLogoClub.getId(), "", 42L))
                .isEqualTo(LogoThumbnailOutcome.SKIPPED);
        assertThat(observedService.generateAfterLogoChange(blankLogoClub.getId(), "   ", 42L))
                .isEqualTo(LogoThumbnailOutcome.SKIPPED);

        verify(observedStorage, never()).download(any());
        verify(observedStorage, never()).uploadBytes(any(), any(), any());
        assertThat(thumbnailUrlOf(emptyLogoClub.getId())).isNull();
        assertThat(thumbnailUrlOf(blankLogoClub.getId())).isNull();
        assertThat(thumbnailTrackingRowCount()).isZero();
        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    @Test
    @DisplayName("로고 업로드 디렉터리(club/logo) 바로 아래가 아닌 자기 스토리지 객체는 내려받지 않고 별도 사유로 건너뛰어 업로드·추적 행 없이 썸네일이 NULL 로 남는다")
    void nonLogoObjectsAreSkippedWithoutDownload(CapturedOutput output) throws Exception {
        FileStorageService observedStorage = spy(fileStorageService);
        ClubLogoThumbnailService observedService = new ClubLogoThumbnailService(
                clubRepository, observedStorage, uploadedObjectService, eventPublisher, platformTransactionManager);
        // club/logo 바로 아래였다면 썸네일이 만들어지는 원본 — 다른 디렉터리와 club/logo 의 하위 경로에 둔다.
        byte[] image = ImageFixture.png(800, 600, true);
        List<String> otherObjectUrls = List.of(
                fileStorageService.uploadBytes(FilePurpose.PHOTO.directory() + "/" + sequence.incrementAndGet() + ".png",
                        image, "image/png"),
                fileStorageService.uploadBytes(FilePurpose.NOTICE_COVER.directory() + "/" + sequence.incrementAndGet() + ".png",
                        image, "image/png"),
                fileStorageService.uploadBytes(FilePurpose.LOGO.directory() + "/nested/" + sequence.incrementAndGet() + ".png",
                        image, "image/png"));

        for (String otherObjectUrl : otherObjectUrls) {
            Club club = saveClub(ClubStatus.ACTIVE, otherObjectUrl);

            assertThat(observedService.generateAfterLogoChange(club.getId(), otherObjectUrl, 42L))
                    .isEqualTo(LogoThumbnailOutcome.SKIPPED);
            assertThat(thumbnailUrlOf(club.getId())).isNull();
            assertThat(output).contains("[로고 썸네일] 건너뜀 — clubId=" + club.getId() + ", reason=NOT_LOGO_OBJECT");
        }
        verify(observedStorage, never()).download(any());
        verify(observedStorage, never()).uploadBytes(any(), any(), any());
        assertThat(thumbnailTrackingRowCount()).isZero();
    }

    @Test
    @DisplayName("생성 중 로고가 다른 URL 로 바뀌었으면 결과를 버리고 만든 객체는 RELEASED 로 남기며 상세 재생성을 요청하지 않는다")
    void discardsResultWhenLogoChangedMeanwhile() throws Exception {
        String staleLogoUrl = seedLogo(ImageFixture.png(800, 600, true), "png");
        String currentLogoUrl = seedLogo(ImageFixture.png(800, 600, true), "png");
        Club club = saveClub(ClubStatus.ACTIVE, currentLogoUrl);

        LogoThumbnailOutcome outcome = clubLogoThumbnailService.generateAfterLogoChange(club.getId(), staleLogoUrl, 42L);

        assertThat(outcome).isEqualTo(LogoThumbnailOutcome.DISCARDED);
        assertThat(thumbnailUrlOf(club.getId())).isNull();
        assertThat(thumbnailTrackingRowCount()).isEqualTo(1);
        UploadedObject discarded = uploadedObjectRepository.findAll().stream()
                .filter(tracked -> tracked.getStorageKey().contains("-thumb."))
                .findFirst().orElseThrow();
        assertThat(discarded.getStatus()).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(discarded.getReleasedAt()).isNotNull();
        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    @Test
    @DisplayName("생성 중 동아리가 폐쇄(soft-delete)됐으면 결과를 버리고 만든 객체는 RELEASED 로 남긴다")
    void discardsResultWhenClubWasDeletedMeanwhile() throws Exception {
        String logoUrl = seedLogo(ImageFixture.png(800, 600, true), "png");
        Club club = saveClub(ClubStatus.INACTIVE, logoUrl);
        clubRepository.delete(club);

        LogoThumbnailOutcome outcome = clubLogoThumbnailService.generateAfterLogoChange(club.getId(), logoUrl, 42L);

        assertThat(outcome).isEqualTo(LogoThumbnailOutcome.DISCARDED);
        assertThat(thumbnailUrlOf(club.getId())).isNull();
        assertThat(uploadedObjectRepository.findAll()).singleElement()
                .satisfies(tracked -> assertThat(tracked.getStatus()).isEqualTo(UploadedObjectStatus.RELEASED));
        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    @Test
    @DisplayName("로고를 바꾼 사용자를 모르면(총동연 등록) 추적 행 업로더는 시스템 표식 0 이다")
    void unknownActorRecordsSystemUploader() throws Exception {
        String logoUrl = seedLogo(ImageFixture.png(800, 600, true), "png");
        Club club = saveClub(ClubStatus.PENDING_APPROVAL, logoUrl);

        clubLogoThumbnailService.generateAfterLogoChange(club.getId(), logoUrl, null);

        assertThat(trackingRowOf(thumbnailUrlOf(club.getId())).getUploaderId())
                .isEqualTo(ClubLogoThumbnailService.SYSTEM_UPLOADER_ID);
    }

    @Test
    @DisplayName("운영진이 로고를 바꾸고 커밋하면 요청과 별개로 전용 실행기가 썸네일을 만들어 반영하고, 같은 URL 재전송은 다시 만들지 않는다")
    void committedLogoChangeGeneratesThumbnailAsynchronouslyOnce() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveClub(ClubStatus.ACTIVE, null);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String logoUrl = seedLogo(ImageFixture.png(800, 600, true), "png");

        clubService.update(logoUpdate(club.getId(), leader.getId(), logoUrl));
        awaitWithin(() -> thumbnailUrlOf(club.getId()) != null);

        String thumbnailUrl = thumbnailUrlOf(club.getId());
        assertThat(thumbnailUrl).matches(PNG_THUMBNAIL_URL_PATTERN);
        assertThat(trackingRowOf(thumbnailUrl).getUploaderId()).isEqualTo(leader.getId());
        assertThat(thumbnailTrackingRowCount()).isEqualTo(1);

        clubService.update(logoUpdate(club.getId(), leader.getId(), logoUrl));
        Thread.sleep(QUIET_WAIT_MS);
        drain(thumbnailExecutor);

        assertThat(thumbnailUrlOf(club.getId())).isEqualTo(thumbnailUrl);
        assertThat(thumbnailTrackingRowCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("로고 변경 이벤트를 발행한 트랜잭션이 롤백되면 썸네일을 만들지 않는다(AFTER_COMMIT)")
    void rolledBackLogoChangeDoesNotGenerate() throws Exception {
        String logoUrl = seedLogo(ImageFixture.png(800, 600, true), "png");
        Club club = saveClub(ClubStatus.ACTIVE, logoUrl);

        transactionTemplate.executeWithoutResult(transactionStatus -> {
            eventPublisher.publishEvent(new ClubLogoChangedEvent(club.getId(), logoUrl, 1L));
            transactionStatus.setRollbackOnly();
        });
        Thread.sleep(QUIET_WAIT_MS);
        drain(thumbnailExecutor);

        assertThat(thumbnailUrlOf(club.getId())).isNull();
        assertThat(thumbnailTrackingRowCount()).isZero();
    }
}
