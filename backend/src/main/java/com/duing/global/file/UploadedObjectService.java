package com.duing.global.file;

import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
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
     * attach 지점 공통 진입 — 각 URL 을 키로 바꿔 PENDING 이면 ACTIVE 로 전이한다.
     * 키를 사전순으로 정렬해 잠근다: 같은 키 집합을 두 tx 가 서로 다른 순서로 잠그는 ABBA 데드락을 없앤다.
     */
    public void activate(String... fileUrls) {
        if (fileUrls == null) {
            return;
        }
        Set<String> storageKeys = new TreeSet<>();
        for (String fileUrl : fileUrls) {
            String storageKey = toStorageKey(fileUrl);
            if (storageKey != null) {
                storageKeys.add(storageKey);
            }
        }
        for (String storageKey : storageKeys) {
            activateKey(storageKey);
        }
    }

    /** 공지 본문(HTML·마크다운 불문)에 등장하는 자기 스토리지 URL 을 전부 활성화한다(스펙 §3.3). */
    public void activateReferencedIn(String content) {
        if (content == null || content.isBlank()) {
            return;
        }
        activate(CONTENT_TOKEN_BOUNDARY.split(content));
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
            case PENDING -> uploadedObject.activate(Instant.now(clock));
            case ACTIVE -> { /* 재수정·재사용 — 멱등 */ }
            case PURGING, PURGED -> throw new FileException.UploadExpiredException();
            // 상태가 추가되면 조용히 no-op 되지 않도록 명시적으로 실패시킨다 — 활성화 누락은 24시간 뒤 파기로 이어진다.
            default -> throw new IllegalStateException("알 수 없는 업로드 추적 상태: " + uploadedObject.getStatus());
        }
    }
}
