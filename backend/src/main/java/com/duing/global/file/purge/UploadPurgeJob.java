package com.duing.global.file.purge;

import com.duing.global.file.FileStorageService;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 업로드 고아 객체 정리 잡(#791, 스펙 §4). 업로드 후 {@code window}(기본 24시간)가 지나도록 어떤 엔티티에도
 * 연결되지 않은(PENDING) 객체와, 이전 실행에서 claim 했지만 삭제가 확정되지 않은(PURGING) 객체를 매시 최대
 * {@value #BATCH_LIMIT}건 처리한다.
 *
 * <p>#1153: 교체·삭제로 해제된(RELEASED) 객체도 후보다 — 유예 기준이 released_at 이라 두 번째 쿼리로 집고,
 * 회당 상한 {@value #BATCH_LIMIT}은 PENDING·PURGING 을 먼저 채운 뒤 남은 한도만 RELEASED 에 준다. RELEASED 는
 * 비참조 보장이 아니므로 참조가 남아 있으면 경고 없이 ACTIVE 로 복구한다(정상 흐름 — 제안 배너 재사용 등).
 *
 * <p>후보마다: 참조 스캔 안전망(§4.3) → dry-run 이면 로그만 → 참조가 남아 있으면 ACTIVE 로 치유(WARN, RELEASED 는 INFO) →
 * claim(잠금 조회 + 상태 술어, 그 사이 attach 가 이겼으면 skip) → 스토리지 delete(트랜잭션 밖) → 확정 시 PURGED.
 * 미확정(false·예외)은 PURGING 으로 남겨 다음 실행이 재시도한다. 개별 실패는 다음 후보로 계속 진행한다.
 *
 * <p>중복 실행 가드는 두지 않는다 — 스케줄러는 기본 단일 스레드이고, 겹치더라도 claim 이 행 잠금+술어로
 * 직렬화되며 스토리지 delete 는 멱등이라 결과가 같다(§4.1).
 *
 * <p>로그 정책(§4.2): objectKey·status·purpose·uploadedAt·releasedAt·deletedAt·reason 만. 파일명·내용·업로더는 남기지 않는다.
 */
@Slf4j
@Component
public class UploadPurgeJob {

    static final int BATCH_LIMIT = 500;
    private static final List<UploadedObjectStatus> CANDIDATE_STATUSES =
            List.of(UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING);

    private final UploadPurgeProperties properties;
    private final Clock clock;
    private final UploadedObjectRepository uploadedObjectRepository;
    private final FileStorageService fileStorageService;
    private final TransactionTemplate transactionTemplate;

    public UploadPurgeJob(
            UploadPurgeProperties properties,
            Clock clock,
            UploadedObjectRepository uploadedObjectRepository,
            FileStorageService fileStorageService,
            PlatformTransactionManager platformTransactionManager) {
        this.properties = properties;
        this.clock = clock;
        this.uploadedObjectRepository = uploadedObjectRepository;
        this.fileStorageService = fileStorageService;
        this.transactionTemplate = new TransactionTemplate(platformTransactionManager);
    }

    @Scheduled(cron = "0 20 * * * *", zone = "Asia/Seoul")
    public void run() {
        if (!properties.enabled()) {
            return;
        }
        Duration window = properties.window();
        if (window == null || window.isZero() || window.isNegative()) {
            // 유예가 0 이면 방금 올린(아직 폼 제출 전인) 업로드까지 즉시 파기된다 — 오설정 시 실행하지 않는다.
            log.error("[업로드 고아 정리] 유예(window={})가 유효하지 않아 실행을 건너뜁니다.", window);
            return;
        }
        Instant cutoff = Instant.now(clock).minus(window);
        boolean deleteEnabled = properties.deleteEnabled();
        List<UploadedObject> pendingCandidates = uploadedObjectRepository.findPurgeCandidates(
                CANDIDATE_STATUSES, cutoff, PageRequest.of(0, BATCH_LIMIT));
        int remainingLimit = BATCH_LIMIT - pendingCandidates.size();
        List<UploadedObject> releasedCandidates = remainingLimit > 0
                ? uploadedObjectRepository.findReleasedCandidates(cutoff, PageRequest.of(0, remainingLimit))
                : List.of();
        if (!deleteEnabled && pendingCandidates.size() >= BATCH_LIMIT) {
            // dry-run 은 상태를 바꾸지 않아 매시 같은 상위 BATCH_LIMIT 건만 다시 본다 — 그 밖의 후보는 표본에 없다.
            // 이 경고가 한 번이라도 나온 주간은 "referenced=true 0건" 만으로 실삭제 전환 판정을 내리지 않는다.
            log.warn("[업로드 고아 정리][dry-run] 후보가 상한({})을 채워 표본이 절단됨 — 오래된 후보만 관찰 중", BATCH_LIMIT);
        }
        if (!deleteEnabled && remainingLimit > 0 && releasedCandidates.size() >= remainingLimit) {
            // RELEASED 는 dry-run 동안 교체·삭제마다 단조 누적된다 — 전환 판정 조건이 아니라 안내만 남긴다.
            log.info("[업로드 고아 정리][dry-run] 해제 후보가 남은 한도({})를 채움 — 실삭제 전환 후 시간당 최대 {}건씩 정리된다",
                    remainingLimit, BATCH_LIMIT);
        }
        List<UploadedObject> candidates = new ArrayList<>(pendingCandidates);
        candidates.addAll(releasedCandidates);

        Counters counters = new Counters();
        for (UploadedObject candidate : candidates) {
            try {
                processCandidate(candidate, deleteEnabled, counters);
            } catch (RuntimeException candidateFailure) {
                // 참조 스캔·claim/확정 tx(데드락 희생·잠금 대기 초과 등)의 예외가 배치 전체를 1시간 멈추지 않도록
                // 후보 단위로 격리한다 — 실패한 후보는 상태가 그대로라 다음 실행이 다시 집는다(스펙 §4.1 "개별 실패는 다음 후보로").
                counters.failed++;
                log.warn("[업로드 고아 정리] 후보 처리 실패로 건너뜀(다음 실행 재시도) - objectKey={}",
                        candidate.getStorageKey(), candidateFailure);
            }
        }
        log.info("[업로드 고아 정리] mode={}, candidates={}, pendingCandidates={}, releasedCandidates={}, purged={}, healed={}, "
                        + "releasedStillReferenced={}, activatedMeanwhile={}, deleteFailed={}, failed={}, referencedInDryRun={}, cutoff={}",
                deleteEnabled ? "delete" : "dry-run", candidates.size(), pendingCandidates.size(), releasedCandidates.size(),
                counters.purged, counters.healed, counters.releasedStillReferenced, counters.activatedMeanwhile,
                counters.deleteFailed, counters.failed, counters.referencedInDryRun, cutoff);
    }

    private void processCandidate(UploadedObject candidate, boolean deleteEnabled, Counters counters) {
        String storageKey = candidate.getStorageKey();
        boolean referenced = uploadedObjectRepository.isReferenced(storageKey);
        // 스냅샷 상태로 분류한다 — RELEASED 였다가 이전 실행의 claim 뒤 삭제가 실패해 PURGING 으로 남은 행은
        // PENDING 쪽(WARN)으로 분류되는데, 이중 실패의 드문 경우라 받아들인다.
        boolean released = candidate.getStatus() == UploadedObjectStatus.RELEASED;

        if (!deleteEnabled) {
            log.info("[업로드 고아 정리][dry-run] objectKey={}, status={}, purpose={}, uploadedAt={}, releasedAt={}, referenced={}",
                    storageKey, candidate.getStatus(), candidate.getPurpose(), candidate.getUploadedAt(),
                    candidate.getReleasedAt(), referenced);
            if (referenced && released) {
                counters.releasedStillReferenced++; // 정상 — 다른 참조가 남아 있는 해제 객체
            } else if (referenced) {
                counters.referencedInDryRun++;
                log.warn("[업로드 고아 정리][dry-run] 참조가 남아 있는 후보 — 활성화 지점 누락 의심: objectKey={}, purpose={}",
                        storageKey, candidate.getPurpose());
            }
            return;
        }

        if (referenced) {
            boolean healed = Boolean.TRUE.equals(transactionTemplate.execute(status ->
                    uploadedObjectRepository.findByIdForUpdate(candidate.getId())
                            .filter(UploadedObject::isPurgeCandidate)
                            .map(locked -> { locked.restoreActive(Instant.now(clock)); return true; })
                            .orElse(false)));
            if (healed && released) {
                counters.releasedStillReferenced++;
                log.info("[업로드 고아 정리] 해제된 객체에 다른 참조가 남아 있어 ACTIVE 로 복구(정상) - objectKey={}, purpose={}",
                        storageKey, candidate.getPurpose());
            } else if (healed) {
                counters.healed++;
                log.warn("[업로드 고아 정리] 참조가 남아 있어 삭제하지 않고 ACTIVE 로 치유 — 활성화 지점 누락 의심: objectKey={}, purpose={}",
                        storageKey, candidate.getPurpose());
            } else {
                // 스냅샷 뒤 ACTIVE·PURGED 로 바뀌어 치유 대상이 아니었다 — 요약 합계가 후보 수와 맞도록 집계한다.
                counters.activatedMeanwhile++;
            }
            return;
        }

        boolean claimed = Boolean.TRUE.equals(transactionTemplate.execute(status ->
                uploadedObjectRepository.findByIdForUpdate(candidate.getId())
                        .filter(UploadedObject::isPurgeCandidate)
                        .map(locked -> { locked.markPurging(); return true; })
                        .orElse(false)));
        if (!claimed) {
            counters.activatedMeanwhile++; // 후보 조회와 claim 사이에 attach 가 이겼다
            return;
        }

        if (!deleteFromStorage(storageKey)) {
            counters.deleteFailed++; // PURGING 유지 → 다음 실행 재시도
            return;
        }

        Instant deletedAt = Instant.now(clock);
        transactionTemplate.executeWithoutResult(status ->
                uploadedObjectRepository.findByIdForUpdate(candidate.getId())
                        .filter(locked -> locked.getStatus() == UploadedObjectStatus.PURGING)
                        .ifPresent(locked -> locked.markPurged(deletedAt)));
        counters.purged++;
        log.info("[업로드 고아 정리] objectKey={}, uploadedAt={}, deletedAt={}, reason=ORPHAN_OBJECT",
                storageKey, candidate.getUploadedAt(), deletedAt);
    }

    // FileStorageService 구현은 예외를 삼키고 boolean 만 돌려주는 best-effort 의미론 — false 와 (방어적으로) 예외
    // 둘 다 "삭제 미확정" 으로 수렴시킨다. 확정 없이 PURGED 로 넘기면 일시 장애에도 객체가 영구 고아가 된다.
    private boolean deleteFromStorage(String storageKey) {
        try {
            return fileStorageService.delete(fileStorageService.toFileUrl(storageKey));
        } catch (Exception storageDeleteFailure) {
            log.warn("[업로드 고아 정리] 스토리지 삭제 실패로 PURGING 유지(다음 실행 재시도) - objectKey={}",
                    storageKey, storageDeleteFailure);
            return false;
        }
    }

    private static final class Counters {
        int purged;
        int healed;
        int releasedStillReferenced;
        int activatedMeanwhile;
        int deleteFailed;
        int failed;
        int referencedInDryRun;
    }
}
