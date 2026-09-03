package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.exception.FileException;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 스토리지는 test 프로파일의 {@code StubFileStorageService}(URL 프리픽스 {@code /files/stub/}) — 실제 I/O 없이
 * {@code toStorageKey} 대칭만 필요하다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class UploadedObjectServiceTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired UploadedObjectService uploadedObjectService;
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired PlatformTransactionManager platformTransactionManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String uniqueKey(FilePurpose purpose) {
        return purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
    }

    private UploadedObject seed(String storageKey, UploadedObjectStatus status) {
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, Instant.now());
        if (status == UploadedObjectStatus.ACTIVE) uploadedObject.activate(Instant.now());
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        if (status == UploadedObjectStatus.PURGED) { uploadedObject.markPurging(); uploadedObject.markPurged(Instant.now()); }
        return uploadedObjectRepository.save(uploadedObject);
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("업로드 기록은 응답 URL 을 스토리지 키로 바꿔 purpose·업로더와 함께 PENDING 행을 남긴다")
    void recordsPendingRowWithKeyPurposeAndUploader() {
        String storageKey = uniqueKey(FilePurpose.NOTICE_COVER);

        uploadedObjectService.recordUpload(STUB_PREFIX + storageKey, FilePurpose.NOTICE_COVER, 42L);

        UploadedObject saved = uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(saved.getPurpose()).isEqualTo(FilePurpose.NOTICE_COVER);
        assertThat(saved.getUploaderId()).isEqualTo(42L);
        assertThat(saved.getUploadedAt()).isNotNull();
    }

    @Test
    @DisplayName("자기 스토리지 URL 이 아닌 값은 기록하지 않고 조용히 건너뛴다")
    void skipsRecordingForForeignUrl() {
        long before = uploadedObjectRepository.count();

        uploadedObjectService.recordUpload("https://elsewhere.example.com/x.jpg", FilePurpose.LOGO, 1L);

        assertThat(uploadedObjectRepository.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("PENDING 업로드를 연결하면 ACTIVE 가 되고, 이미 ACTIVE 인 업로드의 재연결은 멱등이다")
    void activatesPendingAndIsIdempotentForActive() {
        String storageKey = uniqueKey(FilePurpose.LOGO);
        seed(storageKey, UploadedObjectStatus.PENDING);

        uploadedObjectService.activate(STUB_PREFIX + storageKey);
        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        assertThatCode(() -> uploadedObjectService.activate(STUB_PREFIX + storageKey)).doesNotThrowAnyException();
        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("추적 행이 없는(레거시) 키·외부 URL·null·빈 문자열은 연결 시 아무 일도 하지 않는다")
    void ignoresUntrackedForeignAndBlankUrls() {
        assertThatCode(() -> uploadedObjectService.activate(
                STUB_PREFIX + uniqueKey(FilePurpose.LOGO),
                "https://elsewhere.example.com/x.jpg",
                null,
                "  ")).doesNotThrowAnyException();
        assertThatCode(() -> uploadedObjectService.activate((String[]) null)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("파기 잡이 claim(PURGING)했거나 이미 파기(PURGED)한 업로드를 연결하면 만료 400 예외가 난다")
    void rejectsPurgingAndPurgedUploads() {
        String purgingKey = uniqueKey(FilePurpose.LOGO);
        String purgedKey = uniqueKey(FilePurpose.LOGO);
        seed(purgingKey, UploadedObjectStatus.PURGING);
        seed(purgedKey, UploadedObjectStatus.PURGED);

        assertThatThrownBy(() -> uploadedObjectService.activate(STUB_PREFIX + purgingKey))
                .isInstanceOf(FileException.UploadExpiredException.class)
                .hasMessage("업로드한 이미지가 만료되었습니다. 다시 업로드해주세요.");
        assertThatThrownBy(() -> uploadedObjectService.activate(STUB_PREFIX + purgedKey))
                .isInstanceOf(FileException.UploadExpiredException.class);
        assertThat(statusOf(purgingKey)).isEqualTo(UploadedObjectStatus.PURGING);
        assertThat(statusOf(purgedKey)).isEqualTo(UploadedObjectStatus.PURGED);
    }

    @Test
    @DisplayName("본문 활성화는 HTML img·마크다운 이미지·쉼표 뒤 URL·중복 URL 을 모두 잡고 외부 URL 은 무시한다")
    void activatesEveryOwnUrlReferencedInContent() {
        String htmlKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String markdownKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String trailingCommaKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String untouchedKey = uniqueKey(FilePurpose.NOTICE_BODY);
        seed(htmlKey, UploadedObjectStatus.PENDING);
        seed(markdownKey, UploadedObjectStatus.PENDING);
        seed(trailingCommaKey, UploadedObjectStatus.PENDING);
        seed(untouchedKey, UploadedObjectStatus.PENDING);
        String content = "<p>안내</p><img src=\"" + STUB_PREFIX + htmlKey + "\" alt=\"\">"
                + "\n![사진](" + STUB_PREFIX + markdownKey + ")"
                + "\n참고: " + STUB_PREFIX + trailingCommaKey + ", 그리고 " + STUB_PREFIX + htmlKey
                + "\n<img src=\"https://elsewhere.example.com/ext.png\">";

        uploadedObjectService.activateReferencedIn(content);

        assertThat(statusOf(htmlKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(markdownKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(trailingCommaKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(untouchedKey)).isEqualTo(UploadedObjectStatus.PENDING);
    }

    @Test
    @DisplayName("본문이 null 이거나 비어 있으면 본문 활성화는 아무 일도 하지 않는다")
    void ignoresNullOrBlankContent() {
        assertThatCode(() -> uploadedObjectService.activateReferencedIn(null)).doesNotThrowAnyException();
        assertThatCode(() -> uploadedObjectService.activateReferencedIn("   ")).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("연결을 호출한 도메인 트랜잭션이 롤백되면 활성화도 함께 롤백되어 객체는 PENDING 으로 남는다")
    void activationRollsBackWithCallerTransaction() {
        String storageKey = uniqueKey(FilePurpose.LOGO);
        seed(storageKey, UploadedObjectStatus.PENDING);
        TransactionTemplate transactionTemplate = new TransactionTemplate(platformTransactionManager);

        transactionTemplate.executeWithoutResult(status -> {
            uploadedObjectService.activate(STUB_PREFIX + storageKey);
            status.setRollbackOnly();
        });

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.PENDING);
    }
}
