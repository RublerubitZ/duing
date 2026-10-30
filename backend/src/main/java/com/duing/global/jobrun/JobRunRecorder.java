package com.duing.global.jobrun;

import com.duing.global.jobrun.repository.ScheduledJobRunRepository;
import java.time.Clock;
import java.time.Instant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 스케줄 잡의 최근 실행을 남기는 유일한 곳 — 총동연 홈 "자동 작업" 카드가 읽는다.
 *
 * <p>별도 트랜잭션(REQUIRES_NEW)으로 쓴다. 리마인더 잡처럼 읽기 전용 트랜잭션 안에서 불려도 합류하지 않고, 잡이 실패해
 * 바깥 트랜잭션이 롤백돼도 "실패" 기록은 남는다(ClubLogoThumbnailService 전례). 기록 실패는 WARN 한 줄로 삼킨다 —
 * 기록 장치 때문에 잡이 실패로 보이거나 잡의 원래 예외가 가려지면 안 된다. {@code try} 는 {@code execute} 바깥을 감싼다:
 * 커밋 단계 실패는 트랜잭션 경계에서 터지므로 {@code @Transactional} 메서드 안의 {@code try} 로는 잡히지 않는다.
 */
@Slf4j
@Component
public class JobRunRecorder {

    private final ScheduledJobRunRepository scheduledJobRunRepository;
    private final Clock clock;
    private final TransactionTemplate transactionTemplate;

    public JobRunRecorder(ScheduledJobRunRepository scheduledJobRunRepository, Clock clock,
                          PlatformTransactionManager platformTransactionManager) {
        this.scheduledJobRunRepository = scheduledJobRunRepository;
        this.clock = clock;
        this.transactionTemplate = new TransactionTemplate(platformTransactionManager);
        this.transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** 종료 시각은 지금(Instant.now(clock))이다. 시작 시각은 잡이 본문 전에 잰 값을 넘긴다. */
    public void record(MonitoredJob job, Instant startedAt, JobRunOutcome outcome, int resultCount, int failedCount) {
        Instant finishedAt = Instant.now(clock);
        try {
            transactionTemplate.executeWithoutResult(status -> scheduledJobRunRepository.upsert(
                    job.name(), startedAt, finishedAt, outcome.name(), resultCount, failedCount));
        } catch (RuntimeException recordFailure) {
            log.warn("JobRunRecorder: 기록 실패 job={}", job, recordFailure);
        }
    }
}
