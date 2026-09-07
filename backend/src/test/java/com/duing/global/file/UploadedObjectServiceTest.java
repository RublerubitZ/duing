package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
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
        if (status == UploadedObjectStatus.RELEASED) { uploadedObject.activate(Instant.now()); uploadedObject.release(Instant.now()); }
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        if (status == UploadedObjectStatus.PURGED) { uploadedObject.markPurging(); uploadedObject.markPurged(Instant.now()); }
        return uploadedObjectRepository.save(uploadedObject);
    }

    private Instant releasedAtOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getReleasedAt();
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
    @DisplayName("본문 활성화는 HTML img·마크다운 이미지·쉼표 뒤 URL·따옴표 없는 src 속성·중복 URL 을 모두 잡고 외부 URL 은 무시한다")
    void activatesEveryOwnUrlReferencedInContent() {
        String htmlKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String markdownKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String trailingCommaKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String unquotedKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String untouchedKey = uniqueKey(FilePurpose.NOTICE_BODY);
        seed(htmlKey, UploadedObjectStatus.PENDING);
        seed(markdownKey, UploadedObjectStatus.PENDING);
        seed(trailingCommaKey, UploadedObjectStatus.PENDING);
        seed(unquotedKey, UploadedObjectStatus.PENDING);
        seed(untouchedKey, UploadedObjectStatus.PENDING);
        String content = "<p>안내</p><img src=\"" + STUB_PREFIX + htmlKey + "\" alt=\"\">"
                + "\n![사진](" + STUB_PREFIX + markdownKey + ")"
                + "\n참고: " + STUB_PREFIX + trailingCommaKey + ", 그리고 " + STUB_PREFIX + htmlKey
                + "\n<img src=" + STUB_PREFIX + unquotedKey + ">"
                + "\n<img src=\"https://elsewhere.example.com/ext.png\">";

        uploadedObjectService.activateReferencedIn(content);

        assertThat(statusOf(htmlKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(markdownKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(trailingCommaKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(unquotedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
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

    @Test
    @DisplayName("해제는 ACTIVE 만 RELEASED 로 내리고 PENDING·PURGING·PURGED·레거시·외부 URL·null 은 건드리지 않는다")
    void releasesActiveOnly() {
        String activeKey = uniqueKey(FilePurpose.LOGO);
        String pendingKey = uniqueKey(FilePurpose.LOGO);
        String purgingKey = uniqueKey(FilePurpose.LOGO);
        String purgedKey = uniqueKey(FilePurpose.LOGO);
        seed(activeKey, UploadedObjectStatus.ACTIVE);
        seed(pendingKey, UploadedObjectStatus.PENDING);
        seed(purgingKey, UploadedObjectStatus.PURGING);
        seed(purgedKey, UploadedObjectStatus.PURGED);

        assertThatCode(() -> uploadedObjectService.release(
                STUB_PREFIX + activeKey, STUB_PREFIX + pendingKey, STUB_PREFIX + purgingKey, STUB_PREFIX + purgedKey,
                STUB_PREFIX + uniqueKey(FilePurpose.LOGO), "https://elsewhere.example.com/x.jpg", null, " "))
                .doesNotThrowAnyException();
        assertThatCode(() -> uploadedObjectService.release((String[]) null)).doesNotThrowAnyException();

        assertThat(statusOf(activeKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(releasedAtOf(activeKey)).isNotNull();
        assertThat(statusOf(pendingKey)).isEqualTo(UploadedObjectStatus.PENDING);
        assertThat(statusOf(purgingKey)).isEqualTo(UploadedObjectStatus.PURGING);
        assertThat(statusOf(purgedKey)).isEqualTo(UploadedObjectStatus.PURGED);
    }

    @Test
    @DisplayName("이미 RELEASED 인 객체를 다시 해제해도 첫 해제 시각이 유지된다 (유예는 첫 해제 기준)")
    void releaseAgainKeepsFirstReleasedAt() {
        String storageKey = uniqueKey(FilePurpose.LOGO);
        seed(storageKey, UploadedObjectStatus.RELEASED);
        Instant firstReleasedAt = releasedAtOf(storageKey);

        uploadedObjectService.release(STUB_PREFIX + storageKey);

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(releasedAtOf(storageKey)).isEqualTo(firstReleasedAt);
    }

    @Test
    @DisplayName("교체 해제는 스토리지 키가 달라졌을 때만 옛 객체를 해제한다 — 같은 키·previous 없음은 no-op, current null/빈 문자열(비우기)은 해제")
    void releaseIfReplacedComparesStorageKeys() {
        String keptKey = uniqueKey(FilePurpose.COVER);
        String replacedKey = uniqueKey(FilePurpose.COVER);
        String clearedToNullKey = uniqueKey(FilePurpose.COVER);
        String clearedToBlankKey = uniqueKey(FilePurpose.COVER);
        String newKey = uniqueKey(FilePurpose.COVER);
        seed(keptKey, UploadedObjectStatus.ACTIVE);
        seed(replacedKey, UploadedObjectStatus.ACTIVE);
        seed(clearedToNullKey, UploadedObjectStatus.ACTIVE);
        seed(clearedToBlankKey, UploadedObjectStatus.ACTIVE);
        seed(newKey, UploadedObjectStatus.ACTIVE);

        uploadedObjectService.releaseIfReplaced(STUB_PREFIX + keptKey, STUB_PREFIX + keptKey);
        uploadedObjectService.releaseIfReplaced(STUB_PREFIX + replacedKey, STUB_PREFIX + newKey);
        uploadedObjectService.releaseIfReplaced(STUB_PREFIX + clearedToNullKey, null);
        uploadedObjectService.releaseIfReplaced(STUB_PREFIX + clearedToBlankKey, "");
        uploadedObjectService.releaseIfReplaced(null, STUB_PREFIX + newKey);
        uploadedObjectService.releaseIfReplaced("https://elsewhere.example.com/x.jpg", STUB_PREFIX + newKey);

        assertThat(statusOf(keptKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(replacedKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(clearedToNullKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(clearedToBlankKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(newKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("본문 해제는 이전 본문에만 남은 자체 스토리지 URL 만 해제하고, 현재 본문이 null 이면 전부 해제한다")
    void releaseRemovedFromReleasesOnlyMissingKeys() {
        String removedKey = uniqueKey(FilePurpose.NOTICE_BODY);
        String retainedKey = uniqueKey(FilePurpose.NOTICE_BODY);
        seed(removedKey, UploadedObjectStatus.ACTIVE);
        seed(retainedKey, UploadedObjectStatus.ACTIVE);
        String previousContent = "<img src=\"" + STUB_PREFIX + removedKey + "\"><img src=\"" + STUB_PREFIX + retainedKey + "\">";
        String currentContent = "<p>수정</p><img src=\"" + STUB_PREFIX + retainedKey + "\">";

        uploadedObjectService.releaseRemovedFrom(previousContent, currentContent);
        assertThat(statusOf(removedKey)).isEqualTo(UploadedObjectStatus.RELEASED);
        assertThat(statusOf(retainedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        uploadedObjectService.releaseRemovedFrom(currentContent, null);
        assertThat(statusOf(retainedKey)).isEqualTo(UploadedObjectStatus.RELEASED);

        assertThatCode(() -> uploadedObjectService.releaseRemovedFrom(null, currentContent)).doesNotThrowAnyException();
        assertThatCode(() -> uploadedObjectService.releaseRemovedFrom("  ", null)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("RELEASED 업로드를 다시 연결하면 ACTIVE 로 돌아오고 해제 시각이 비워진다 (편집 되돌리기·재사용)")
    void reactivatesReleased() {
        String storageKey = uniqueKey(FilePurpose.LOGO);
        seed(storageKey, UploadedObjectStatus.RELEASED);

        uploadedObjectService.activate(STUB_PREFIX + storageKey);

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(releasedAtOf(storageKey)).isNull();
    }
}
