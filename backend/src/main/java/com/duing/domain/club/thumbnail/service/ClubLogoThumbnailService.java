package com.duing.domain.club.thumbnail.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.global.file.FilePurpose;
import com.duing.global.file.FileStorageService;
import com.duing.global.file.FileUploadPolicy;
import com.duing.global.file.StoredFile;
import com.duing.global.file.UploadedObjectService;
import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 동아리 로고 썸네일 생성·반영(스펙 §4.3·§4.4). 트랜잭션 밖(전용 실행기·백필 스레드)에서 부른다 — 다운로드·리사이즈·업로드는
 * tx 없이 하고(DB 커넥션을 잡고 I/O 를 기다리지 않는다), 반영(조건부 갱신 + 추적 행 + 상세 재생성 이벤트)만 짧은 tx 다.
 *
 * <p>조건부 갱신은 "생성에 쓴 원본이 그대로이고 썸네일이 비어 있고 폐쇄되지 않았을 때" 만 쓴다 — 그사이 로고가 바뀌었거나
 * 다른 생성이 먼저 반영됐거나 폐쇄됐으면 만든 객체의 추적 행을 RELEASED 로 남겨 파기 잡이 유예 뒤 지운다(경합 안전).
 * 원본이 이미 작으면(긴 변 ≤ 384) 새 객체 없이 원본 URL 을 넣고 추적 행도 만들지 않는다 — 해제는 원본 해제 경로가 맡는다.
 *
 * <p>상세 재생성 이벤트는 로고 변경 경로({@link #generateAfterLogoChange})만 발행한다. 백필({@link #generateForBackfill})은
 * 발행하지 않는다 — 러너가 반영 직후 공개 동아리만 직접 요청한다(스펙 §4.5). 발행하면 리스너가 공개 여부를 거르지 않아 비공개 동아리까지
 * 렌더되고, 공개 동아리는 두 번 렌더되며, 생성 속도가 재생성 큐(100)를 넘칠 수 있다.
 *
 * <p>로그에는 clubId·사유만 남긴다(URL·키 금지). 건너뜀은 INFO, 스토리지 장애 등 예외는 호출자(리스너·백필)가 WARN 으로 센다.
 */
@Slf4j
@Service
public class ClubLogoThumbnailService {

    /** 백필·행위자 미상(총동연 등록 경로) 썸네일의 추적 행 업로더 — 마이그레이션 없는 시스템 표식(스펙 §4.4). */
    public static final long SYSTEM_UPLOADER_ID = 0L;
    /** 파일명으로 썸네일임을 구분한다 — 키에 `_`·`%` 를 넣지 않는다(참조 스캔의 접미 LIKE 전제). */
    private static final String THUMBNAIL_FILE_SUFFIX = "-thumb";
    /** 로고 업로드(purpose=LOGO)와 썸네일이 객체를 두는 디렉터리 — 원본은 이 바로 아래 객체만 쓴다. */
    private static final String LOGO_DIRECTORY_PREFIX = FilePurpose.LOGO.directory() + "/";

    private final ClubRepository clubRepository;
    private final FileStorageService fileStorageService;
    private final UploadedObjectService uploadedObjectService;
    private final ApplicationEventPublisher eventPublisher;
    private final TransactionTemplate transactionTemplate;

    public ClubLogoThumbnailService(ClubRepository clubRepository, FileStorageService fileStorageService,
                                    UploadedObjectService uploadedObjectService, ApplicationEventPublisher eventPublisher,
                                    PlatformTransactionManager platformTransactionManager) {
        this.clubRepository = clubRepository;
        this.fileStorageService = fileStorageService;
        this.uploadedObjectService = uploadedObjectService;
        this.eventPublisher = eventPublisher;
        this.transactionTemplate = new TransactionTemplate(platformTransactionManager);
        // AFTER_COMMIT 리스너 안에서 동기로 불려도 이미 끝난 바깥 tx 에 합류하지 않게 — 합류하면 그 쓰기는 커밋되지 않는다.
        this.transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * 로고 변경 커밋 뒤 — 반영되면 갱신 tx 안에서 상세 재생성 이벤트를 발행한다.
     *
     * @param changedByUserId 로고를 바꾼 사용자 — 추적 행 업로더. null 이면 {@link #SYSTEM_UPLOADER_ID}.
     * @throws RuntimeException 스토리지 장애(다운로드·업로드)·DB 장애 — 호출자가 실패로 세고 다음 기동의 백필이 다시 집는다.
     */
    public LogoThumbnailOutcome generateAfterLogoChange(Long clubId, String logoUrl, Long changedByUserId) {
        return generate(clubId, logoUrl, changedByUserId == null ? SYSTEM_UPLOADER_ID : changedByUserId, true);
    }

    /** 백필 — 상세 재생성 이벤트를 발행하지 않는다(러너가 반영 직후 공개 동아리만 직접 요청한다). 업로더는 시스템 표식. */
    public LogoThumbnailOutcome generateForBackfill(Long clubId, String logoUrl) {
        return generate(clubId, logoUrl, SYSTEM_UPLOADER_ID, false);
    }

    private LogoThumbnailOutcome generate(Long clubId, String logoUrl, long uploaderId, boolean publishDetailChange) {
        String storageKey = fileStorageService.toStorageKey(logoUrl);
        if (storageKey == null) {
            return skipped(clubId, "EXTERNAL_URL");
        }
        // 로고 업로드 객체(club/logo/<파일 하나>, 하위 경로 없음)만 원본으로 쓴다 — 로고 URL 검증은 링크 형식만 본다.
        if (!storageKey.startsWith(LOGO_DIRECTORY_PREFIX) || storageKey.indexOf('/', LOGO_DIRECTORY_PREFIX.length()) >= 0) {
            return skipped(clubId, "NOT_LOGO_OBJECT");
        }
        byte[] source = download(storageKey);
        if (source == null) {
            return skipped(clubId, "NOT_FOUND");
        }
        return switch (LogoThumbnailGenerator.generate(source)) {
            case LogoThumbnailResult.Skipped skippedResult -> skipped(clubId, skippedResult.reason().name());
            case LogoThumbnailResult.UseOriginal useOriginal ->
                    apply(clubId, logoUrl, logoUrl, false, uploaderId, publishDetailChange);
            case LogoThumbnailResult.Generated generated -> {
                String thumbnailUrl = fileStorageService.uploadBytes(
                        newThumbnailKey(generated.contentType()), generated.bytes(), generated.contentType());
                yield apply(clubId, logoUrl, thumbnailUrl, true, uploaderId, publishDetailChange);
            }
        };
    }

    private byte[] download(String storageKey) {
        StoredFile storedFile = fileStorageService.download(storageKey);
        if (storedFile == null) {
            return null;
        }
        try (InputStream stream = storedFile.stream()) {
            return stream.readAllBytes();
        } catch (IOException readFailure) {
            throw new IllegalStateException("로고 원본을 읽지 못했습니다.", readFailure);
        }
    }

    /** 같은 원본을 다시 만들어도 새 UUID 라 uq_uploaded_object_storage_key 와 충돌하지 않는다. */
    private static String newThumbnailKey(String contentType) {
        return FilePurpose.LOGO.directory() + "/" + UUID.randomUUID() + THUMBNAIL_FILE_SUFFIX + "."
                + FileUploadPolicy.EXTENSION_BY_MIME.get(contentType);
    }

    private LogoThumbnailOutcome apply(Long clubId, String logoUrl, String thumbnailUrl, boolean newObject,
                                       long uploaderId, boolean publishDetailChange) {
        return transactionTemplate.execute(transactionStatus -> {
            boolean applied = clubRepository.setLogoThumbnailUrlIfLogoUnchanged(clubId, logoUrl, thumbnailUrl) == 1;
            if (newObject) {
                // 반영됐으면 ACTIVE, 경합이면 바로 RELEASED — 파기 잡이 유예 뒤 지운다.
                uploadedObjectService.recordServerGenerated(thumbnailUrl, FilePurpose.LOGO, uploaderId, applied);
            }
            if (!applied) {
                log.info("[로고 썸네일] 반영 안 함(그사이 로고가 바뀌었거나 이미 있거나 폐쇄) — clubId={}", clubId);
                return LogoThumbnailOutcome.DISCARDED;
            }
            if (publishDetailChange) {
                // 같은 tx 안에서 발행해야 AFTER_COMMIT 리스너(상세 재생성)가 받는다.
                eventPublisher.publishEvent(new ClubPublicPageChangedEvent(clubId));
            }
            return LogoThumbnailOutcome.STORED;
        });
    }

    private static LogoThumbnailOutcome skipped(Long clubId, String reason) {
        log.info("[로고 썸네일] 건너뜀 — clubId={}, reason={}", clubId, reason);
        return LogoThumbnailOutcome.SKIPPED;
    }
}
