package com.duing.domain.federation.job;

import com.duing.domain.federation.repository.FederationInquiryAnswerRepository;
import com.duing.domain.federation.repository.FederationInquiryAttachmentPurgeTarget;
import com.duing.domain.federation.repository.FederationInquiryAttachmentRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.global.file.FileStorageService;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * PIPA 제21조(보관기간 종료 시 지체없는 파기) 대응 — soft-delete 된 총동연 1:1 문의가 보관기간
 * (window)을 넘기면 본문·첨부의 PII 를 파기하는 스케줄 잡. 스펙 2026-07-04-federation-qna-design.md
 * §4 가 선기록한 "PiiRetentionJob 대상은 하드코딩이라 신규 테이블이 자동 포함되지 않으니 P3 파기
 * 배치 설계 시 반영" 요구의 이행이다.
 *
 * <p>문의 title/content/closed_reason 과 그 문의에 딸린 답변 content 는 placeholder 로 비우고 행은
 * 보존한다(감사 이력·FK 무결성 보존 — users 익명화 전례). 첨부는 스토리지 객체 삭제에 성공한 것만
 * 행을 물리 삭제한다(email_verifications·notification 물리 삭제 전례 — storage_key 만 남은 행은
 * 보관 가치가 없다). 스토리지 삭제 실패는 warn 로그 후 행을 보존해 다음 실행이 자연 재시도하게
 * 한다(별도 재시도 큐 불요).
 *
 * <p><b>비대칭(Out of Scope)</b>: 삭제되지 않은 ANSWERED/CLOSED 문의의 본문 잔존은 이 배치의 대상이
 * 아니다 — 보관기간 정책이 운영 결정으로 확정된 뒤 후속 조치한다(스펙 §4 "작성자 익명화+본문 잔존
 * 비대칭은 운영 결정 문서에 명시" 요구대로 PR 본문에 명시).
 */
@Slf4j
@Component
public class FederationInquiryPurgeJob {

    private static final String PLACEHOLDER_TITLE = "(파기된 문의)";
    private static final String PLACEHOLDER_CONTENT = "(보관기간 경과로 파기되었습니다)";

    private final FederationInquiryPurgeProperties properties;
    private final Clock clock;
    private final FederationInquiryRepository inquiryRepository;
    private final FederationInquiryAnswerRepository answerRepository;
    private final FederationInquiryAttachmentRepository attachmentRepository;
    private final FileStorageService fileStorageService;
    /** scrub 벌크 2건만 이 템플릿으로 단일 짧은 트랜잭션을 연다 — 첨부는 외부 호출을 포함해 별도(per-item). */
    private final TransactionTemplate transactionTemplate;

    public FederationInquiryPurgeJob(
            FederationInquiryPurgeProperties properties,
            Clock clock,
            FederationInquiryRepository inquiryRepository,
            FederationInquiryAnswerRepository answerRepository,
            FederationInquiryAttachmentRepository attachmentRepository,
            FileStorageService fileStorageService,
            PlatformTransactionManager platformTransactionManager) {
        this.properties = properties;
        this.clock = clock;
        this.inquiryRepository = inquiryRepository;
        this.answerRepository = answerRepository;
        this.attachmentRepository = attachmentRepository;
        this.fileStorageService = fileStorageService;
        this.transactionTemplate = new TransactionTemplate(platformTransactionManager);
    }

    @Scheduled(cron = "0 40 4 * * *", zone = "Asia/Seoul")
    public void run() {
        if (!properties.enabled()) {
            return;
        }
        Period window = properties.window();
        if (window.isZero() || window.isNegative()) {
            // 보관기간이 0/음수면 활성 직후 삭제된 문의(심하면 미래 cutoff 로 모든 soft-delete 행)까지
            // 즉시 파기되는 비가역 사고가 난다 — 오설정 시 실행하지 않고 안전하게 건너뛴다(PII 잡 전례).
            log.error("[문의 보관기간 파기] 보관기간(window={})이 유효하지 않아 실행을 건너뜁니다.", window);
            return;
        }
        LocalDateTime cutoff = LocalDateTime.now(clock).minus(window);

        ScrubResult scrubResult = transactionTemplate.execute(status -> scrub(cutoff));
        int inquiriesScrubbed = scrubResult == null ? 0 : scrubResult.inquiriesScrubbed();
        int answersScrubbed = scrubResult == null ? 0 : scrubResult.answersScrubbed();

        PurgeResult purgeResult = purgeAttachments(cutoff);

        log.info("[문의 보관기간 파기] inquiriesScrubbed={}, answersScrubbed={}, attachmentsPurged={}, "
                        + "attachmentsSkipped={}, cutoff={}",
                inquiriesScrubbed, answersScrubbed, purgeResult.purged(), purgeResult.skipped(), cutoff);
    }

    // 문의·답변 벌크 UPDATE 2건 — 외부 호출이 없어 단일 짧은 트랜잭션으로 묶는다.
    private ScrubResult scrub(LocalDateTime cutoff) {
        int inquiriesScrubbed = inquiryRepository.scrubExpiredDeletedInquiries(
                cutoff, PLACEHOLDER_TITLE, PLACEHOLDER_CONTENT);
        int answersScrubbed = answerRepository.scrubAnswersOfExpiredInquiries(cutoff, PLACEHOLDER_CONTENT);
        return new ScrubResult(inquiriesScrubbed, answersScrubbed);
    }

    /**
     * 첨부는 트랜잭션 밖에서 외부 스토리지 호출을 마친 뒤, 성공한 건만 개별 짧은 트랜잭션으로 행을
     * 삭제한다(GeneralBankTransactionSyncService 전례 — 외부 호출을 DB 트랜잭션 안에 두지 않는다).
     * 개별 항목의 실패는 warn 로그 후 skip 하고 다음 첨부로 계속 진행한다(DeadlineNotificationJob
     * 루프 전례) — 실패한 행은 보존되어 다음 실행이 자연 재시도한다.
     */
    private PurgeResult purgeAttachments(LocalDateTime cutoff) {
        List<FederationInquiryAttachmentPurgeTarget> targets = attachmentRepository.findPurgeTargets(cutoff);
        int purged = 0;
        int skipped = 0;
        for (FederationInquiryAttachmentPurgeTarget target : targets) {
            try {
                fileStorageService.delete(fileStorageService.toFileUrl(target.getStorageKey()));
            } catch (Exception storageDeleteFailure) {
                log.warn("[문의 보관기간 파기] 첨부 스토리지 삭제 실패로 행 보존(다음 실행 재시도) - attachmentId={}",
                        target.getId(), storageDeleteFailure);
                skipped++;
                continue;
            }
            transactionTemplate.executeWithoutResult(status -> attachmentRepository.hardDeleteById(target.getId()));
            purged++;
        }
        return new PurgeResult(purged, skipped);
    }

    private record ScrubResult(int inquiriesScrubbed, int answersScrubbed) {}

    private record PurgeResult(int purged, int skipped) {}
}
