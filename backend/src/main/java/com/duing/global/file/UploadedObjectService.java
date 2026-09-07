package com.duing.global.file;

import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.exception.FileException;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 업로드 객체 추적(#791, 스펙 §3) — 업로드 API 가 남긴 객체를 PENDING 으로 기록하고, 엔티티에 연결되는 순간
 * ACTIVE 로 바꾼다. 도메인 서비스는 쓰기 메서드 안(같은 tx)에서 {@link #activate} 를 부른다.
 *
 * <p>활성화는 {@code findByStorageKeyForUpdate} 잠금 조회로 시작한다 — 도메인 tx 커밋까지 행이 잠겨 파기 잡의
 * claim 이 대기하고, claim 이 먼저 커밋됐다면 PURGING 을 보고 만료 400 으로 실패한다(TOCTOU 계약). 도메인 쓰기가
 * 다른 이유로 롤백되면 활성화도 함께 롤백돼 객체는 정상 파기 대상으로 남는다.
 *
 * <p>해제(#1153, 스펙 §3) — 교체·비우기·삭제로 참조를 놓은 URL 은 {@link #release}·{@link #releaseIfReplaced}·
 * {@link #releaseRemovedFrom} 으로 ACTIVE→RELEASED 로 내린다(같은 tx, 활성화 뒤). RELEASED 는 "어떤 쓰기 경로가 이 키를
 * 놓았다" 는 신호일 뿐 비참조 보장이 아니다 — 삭제 여부의 최종 판정은 파기 잡의 참조 스캔이다.
 *
 * <p>추적 행이 없는 키(추적 테이블 도입 이전 레거시 객체)와 자기 스토리지가 아닌 URL 은 조용히 건너뛴다 —
 * 외부 URL 차단은 이 컴포넌트의 책임이 아니다(공지 커버 prefix 검증 등은 도메인에 있다).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class UploadedObjectService {

    // 본문 토큰 경계 — 공백·따옴표·태그 괄호·소괄호·대괄호·쉼표·세미콜론·등호. 마크다운 문장 끝의 구두점이 URL 에
    // 붙어 키 조회가 빗나가는 것을 막고, 따옴표 없는 src=URL 속성도 분리한다(스펙 §3.3).
    private static final Pattern CONTENT_TOKEN_BOUNDARY = Pattern.compile("[\\s\"'<>()\\[\\],;=]+");

    private final UploadedObjectRepository uploadedObjectRepository;
    private final FileStorageService fileStorageService;
    private final Clock clock;

    /** 업로드 API 성공 직후 호출 — 응답 URL 을 키로 바꿔 PENDING 행을 남긴다. DB 예외는 전파한다(스펙 §3.1). */
    public void recordUpload(String fileUrl, FilePurpose purpose, Long uploaderId) {
        String storageKey = fileStorageService.toStorageKey(fileUrl);
        if (storageKey == null) {
            // 정상 구현에서는 발생하지 않는다(upload 가 돌려준 URL 은 항상 자기 프리픽스) — 추적만 포기하고 요청은 성공시킨다.
            log.warn("[업로드 추적] 자기 스토리지 URL 이 아니어서 기록을 건너뜀: purpose={}", purpose);
            return;
        }
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, purpose, uploaderId, Instant.now(clock)));
    }

    /**
     * attach 지점 공통 진입 — 각 URL 을 키로 바꿔 PENDING·RELEASED 이면 ACTIVE 로 전이한다.
     * 키를 사전순으로 정렬해 잠근다: 같은 키 집합을 두 tx 가 서로 다른 순서로 잠그는 ABBA 데드락을 없앤다.
     */
    public void activate(String... fileUrls) {
        for (String storageKey : storageKeysOf(fileUrls)) {
            activateKey(storageKey);
        }
    }

    /** 공지 본문(HTML·마크다운 불문)에 등장하는 자기 스토리지 URL 을 전부 활성화한다(스펙 §3.3). */
    public void activateReferencedIn(String content) {
        for (String storageKey : storageKeysIn(content)) {
            activateKey(storageKey);
        }
    }

    /** 삭제 — 주어진 URL 을 전부 해제한다. null·빈값·외부 URL·추적 행 없음·ACTIVE 가 아닌 상태는 건너뛴다. */
    public void release(String... fileUrls) {
        for (String storageKey : storageKeysOf(fileUrls)) {
            releaseKey(storageKey);
        }
    }

    /**
     * 교체·비우기 — previous 가 자기 스토리지 키이고 current 의 키와 다르면 previous 를 해제한다.
     * 비교는 스토리지 키 기준이라 비우기가 {@code null} 이든 {@code ""} 이든(도메인마다 다르다) 해제로 수렴한다.
     */
    public void releaseIfReplaced(String previousUrl, String currentUrl) {
        String previousKey = toStorageKey(previousUrl);
        if (previousKey == null || previousKey.equals(toStorageKey(currentUrl))) {
            return;
        }
        releaseKey(previousKey);
    }

    /** 본문 편집·삭제 — 이전 본문의 자기 스토리지 URL 중 현재 본문에 없는 키를 해제한다. current 가 null 이면 전부. */
    public void releaseRemovedFrom(String previousContent, String currentContent) {
        Set<String> removedKeys = storageKeysIn(previousContent);
        removedKeys.removeAll(storageKeysIn(currentContent));
        for (String storageKey : removedKeys) {
            releaseKey(storageKey);
        }
    }

    private Set<String> storageKeysOf(String... fileUrls) {
        Set<String> storageKeys = new TreeSet<>();
        if (fileUrls == null) {
            return storageKeys;
        }
        for (String fileUrl : fileUrls) {
            String storageKey = toStorageKey(fileUrl);
            if (storageKey != null) {
                storageKeys.add(storageKey);
            }
        }
        return storageKeys;
    }

    private Set<String> storageKeysIn(String content) {
        if (content == null || content.isBlank()) {
            return new TreeSet<>();
        }
        return storageKeysOf(CONTENT_TOKEN_BOUNDARY.split(content));
    }

    private String toStorageKey(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return null;
        }
        return fileStorageService.toStorageKey(fileUrl);
    }

    // 잠금 조회가 이 tx 안에서 UploadedObject 의 유일한 첫 조회여야 한다 — 앞에서 무잠금으로 읽으면 잠금이
    // 1차 캐시의 낡은 인스턴스를 돌려줘 PURGING 전환을 못 본다.
    private void activateKey(String storageKey) {
        Optional<UploadedObject> tracked = uploadedObjectRepository.findByStorageKeyForUpdate(storageKey);
        if (tracked.isEmpty()) {
            return; // 추적 이전 레거시 객체 — grandfather
        }
        UploadedObject uploadedObject = tracked.get();
        switch (uploadedObject.getStatus()) {
            case PENDING, RELEASED -> uploadedObject.activate(Instant.now(clock)); // RELEASED = 편집 되돌리기·재사용
            case ACTIVE -> { /* 재수정·재사용 — 멱등 */ }
            case PURGING, PURGED -> throw new FileException.UploadExpiredException();
            // 상태가 추가되면 조용히 no-op 되지 않도록 명시적으로 실패시킨다 — 활성화 누락은 24시간 뒤 파기로 이어진다.
            default -> throw new IllegalStateException("알 수 없는 업로드 추적 상태: " + uploadedObject.getStatus());
        }
    }

    private void releaseKey(String storageKey) {
        Optional<UploadedObject> tracked = uploadedObjectRepository.findByStorageKeyForUpdate(storageKey);
        if (tracked.isEmpty()) {
            return; // 레거시
        }
        UploadedObject uploadedObject = tracked.get();
        if (uploadedObject.getStatus() == UploadedObjectStatus.ACTIVE) {
            uploadedObject.release(Instant.now(clock));
        }
        // PENDING(활성화 누락 — 잡의 안전망 몫)·RELEASED(재해제, 첫 released_at 유지)·PURGING·PURGED 는 no-op.
    }
}
