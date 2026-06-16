package com.duing.domain.fee.service;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.exception.FeePolicyException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
import java.time.Clock;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFeeBillService implements FeeBillService {

    private final FeePolicyRepository feePolicyRepository;
    private final FeeBillRepository feeBillRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;
    private final BillingPeriodResolver periodResolver;
    private final Clock clock; // Asia/Seoul Clock 빈(due_date 과거 검증의 '오늘')

    @Override
    @Transactional
    public GenerateBillsResult generate(GenerateBillsCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 비관적 잠금: 발행 도중 정책 비활성화·삭제(update/delete)와의 경합을 직렬화한다.
        FeePolicy policy = feePolicyRepository.findByIdAndClubIdForUpdate(command.policyId(), command.clubId())
                .orElseThrow(FeePolicyException.FeePolicyNotFoundException::new);
        if (!policy.isActive()) {
            throw new FeePolicyException.InactiveFeePolicyException();
        }
        BillingPeriodResolver.Resolved resolved = resolve(policy.getBillingType(), command);
        validateDueDate(resolved, command.dueDate(), policy.getBillingType());

        // 단일 원자 INSERT...SELECT...ON CONFLICT DO NOTHING. created = 실제 INSERT 된 행 수.
        int created = feeBillRepository.bulkInsertBills(
                command.clubId(), policy.getId(), policy.getAmount(), resolved.billingPeriod(),
                resolved.startDate(), resolved.endDate(), resolved.dueDate());
        long activeCount = clubMemberRepository.countActiveByClubId(command.clubId());
        int skipped = (int) Math.max(0L, activeCount - created); // 동시 멤버 변동으로 음수가 되지 않게 클램프

        log.info("fee bills generated: actorId={}, clubId={}, policyId={}, period={}, created={}, skipped={}",
                command.actorId(), command.clubId(), policy.getId(), resolved.billingPeriod(), created, skipped);
        return new GenerateBillsResult(created, skipped);
    }

    @Override
    @Transactional
    public void cancel(Long clubId, Long actorId, Long billId) {
        clubAuthService.requireManager(actorId, clubId);
        // bill 조회는 Read Committed 일반 SELECT 라 행 락을 남기지 않는다(정책 id 만 얻는 용도).
        FeeBill bill = feeBillRepository.findByIdAndClubId(billId, clubId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        // 그 직후 generate() 와 동일하게 '정책 행'만 비관적 잠금해 취소·재발행을 직렬화한다. cancel 이
        // 잡는 유일한 락이 정책 락이므로 두 메서드의 락 순서가 동일(policy-only)해 데드락이 없다.
        // 락이 없으면 진행 중 취소 + 동시 재발행이 ON CONFLICT DO NOTHING 으로 서로 비껴가 활성 청구가
        // 0건이 되는 lost-charge 경합이 가능하다.
        // 청구가 있는 정책은 삭제될 수 없어(DeleteForbidden) 정상적으로는 항상 조회되지만,
        // 혹시 부재하면 500 대신 락 없이 진행한다(반환값은 잠금 목적이라 사용하지 않는다).
        feePolicyRepository.findByIdAndClubIdForUpdate(bill.getFeePolicyId(), clubId);
        FeeStatus previous = bill.getStatus();
        bill.cancel(); // 이미 CANCELLED 면 멱등 no-op
        log.info("fee bill cancelled: actorId={}, billId={}, previousStatus={}", actorId, billId, previous);
    }

    private BillingPeriodResolver.Resolved resolve(BillingType type, GenerateBillsCommand command) {
        return switch (type) {
            case MONTHLY -> periodResolver.resolveMonthly(command.billingPeriod());
            case YEARLY -> periodResolver.resolveYearly(command.billingPeriod(), command.dueDate());
            case SEMESTER, ONE_TIME -> periodResolver.resolveExplicit(
                    command.billingPeriod(), command.billingStartDate(),
                    command.billingEndDate(), command.dueDate());
        };
    }

    // §5.1 마감일 검증. 1) 정합성(전 타입): due >= start. 2) 과거 차단(운영자 override 한정, ONE_TIME 면제).
    private void validateDueDate(BillingPeriodResolver.Resolved resolved, LocalDate dueOverride, BillingType type) {
        if (resolved.dueDate().isBefore(resolved.startDate())) {
            throw FeeBillException.InvalidBillingPeriodException.dueBeforePeriod();
        }
        boolean operatorOverride = dueOverride != null;
        if (operatorOverride && type != BillingType.ONE_TIME
                && resolved.dueDate().isBefore(LocalDate.now(clock))) {
            throw FeeBillException.InvalidBillingPeriodException.dueInPast();
        }
    }
}
