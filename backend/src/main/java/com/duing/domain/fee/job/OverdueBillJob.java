package com.duing.domain.fee.job;

import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.notification.event.FeeBillOverdueEvent;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매일 00:10(Asia/Seoul)에 실행되는 회비 연체 전이 크론.
 * 마감(due_date)이 지난 PENDING·PARTIAL_PAID 청구를 OVERDUE 로 일괄 전이하고,
 * 이번 실행에서 전이된 청구의 회원에게 FEE_BILL_OVERDUE 인앱 알림을 발송한다(트랜잭션 커밋 후, 멱등).
 * {@code duing.fee.overdue.enabled=true} 가 설정된 환경에서만 빈이 등록된다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.fee.overdue", name = "enabled", havingValue = "true")
public class OverdueBillJob {

    private final FeeBillRepository feeBillRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    @Scheduled(cron = "0 10 0 * * *", zone = "Asia/Seoul") // 매일 00:10 (Asia/Seoul)
    @Transactional
    public void run() {
        LocalDate today = LocalDate.now(clock);
        List<Object[]> candidates = feeBillRepository.lockOverdueCandidates(today);
        if (candidates.isEmpty()) {
            log.info("OverdueBillJob: 전이 대상 없음");
            return;
        }
        List<Long> ids = candidates.stream().map(row -> ((Number) row[0]).longValue()).toList();
        int transitioned = feeBillRepository.markOverdue(ids);
        log.info("OverdueBillJob: transitioned={}", transitioned);
        for (Object[] row : candidates) {
            eventPublisher.publishEvent(new FeeBillOverdueEvent(
                    ((Number) row[0]).longValue(), ((Number) row[1]).longValue(), (String) row[2]));
        }
    }
}
