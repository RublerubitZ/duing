package com.duing.domain.fee.job;

import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.FeeBillService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 매일 00:20(Asia/Seoul)에 실행되는 회비 자동 월발행 크론.
 * 활성 MONTHLY auto_issue 정책 중 발행일이 오늘 일자 이하인(today.day >= issue_day, 캐치업) 정책의
 * 그 달 청구를 멱등 발행한다(ON CONFLICT DO NOTHING — 이미 발행이면 재발행·재알림 없음).
 * 이어서 전월 캐치업: 월말 며칠 잡이 멈춰 전월 청구가 빠진 경우를 복구한다 — 전월 이전에 만든 정책만 대상
 * (이번 달에 만든 정책이 소급 청구되지 않게), 기발행 회차는 멱등 키로 created=0·알림 없음.
 * {@code duing.fee.auto-issue.enabled=true} 가 설정된 환경에서만 빈이 등록된다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.fee.auto-issue", name = "enabled", havingValue = "true")
public class MonthlyBillIssueJob {

    private final FeePolicyRepository feePolicyRepository;
    private final FeeBillService feeBillService;
    private final Clock clock;

    // 매일 00:20 (Asia/Seoul). 연체 크론(00:10)과 시간을 분리한다.
    // run() 은 @Transactional 이 아니다 — 각 정책 발행(autoIssueMonthly)이 자체 트랜잭션을 가져
    // 한 정책 실패가 배치 전체를 막거나 롤백시키지 않게 한다(try/catch 로 정책별 격리).
    @Scheduled(cron = "0 20 0 * * *", zone = "Asia/Seoul")
    public void run() {
        LocalDate today = LocalDate.now(clock);
        issueCurrentMonth(today);
        catchUpPreviousMonth(today);
    }

    private void issueCurrentMonth(LocalDate today) {
        int dayOfMonth = today.getDayOfMonth();
        List<FeePolicy> duePolicies = feePolicyRepository.findAutoIssueDue(dayOfMonth);
        if (duePolicies.isEmpty()) {
            log.info("MonthlyBillIssueJob: 자동발행 대상 정책 없음 (day={})", dayOfMonth);
            return;
        }
        int succeeded = 0;
        for (FeePolicy policy : duePolicies) {
            try {
                feeBillService.autoIssueMonthly(policy, today);
                succeeded++;
            } catch (Exception policyIssueFailure) {
                log.warn("MonthlyBillIssueJob: 정책 자동발행 실패 clubId={}, policyId={}",
                        policy.getClubId(), policy.getId(), policyIssueFailure);
            }
        }
        log.info("MonthlyBillIssueJob: 대상 {}건 중 {}건 처리", duePolicies.size(), succeeded);
    }

    private void catchUpPreviousMonth(LocalDate today) {
        LocalDate previousMonth = today.minusMonths(1);
        LocalDate thisMonthStart = today.withDayOfMonth(1);
        // 전월은 이미 끝났으므로 issue_day 와 무관하게 전 정책이 대상(issue_day 상한 28 ≤ 31).
        List<FeePolicy> catchUpPolicies = feePolicyRepository.findAutoIssueDue(31).stream()
                .filter(policy -> policy.getCreatedAt().toLocalDate().isBefore(thisMonthStart))
                .toList();
        int succeeded = 0;
        for (FeePolicy policy : catchUpPolicies) {
            try {
                feeBillService.autoIssueMonthly(policy, previousMonth);
                succeeded++;
            } catch (Exception policyIssueFailure) {
                log.warn("MonthlyBillIssueJob: 전월 캐치업 실패 clubId={}, policyId={}",
                        policy.getClubId(), policy.getId(), policyIssueFailure);
            }
        }
        log.info("MonthlyBillIssueJob: 전월 캐치업 대상 {}건 중 {}건 처리", catchUpPolicies.size(), succeeded);
    }
}
