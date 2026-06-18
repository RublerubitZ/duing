package com.duing.domain.fee.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.exception.FeePolicyException;
import com.duing.domain.fee.controller.dto.response.FeeBillResponse;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.FeeBillQuery;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
import com.duing.domain.notification.event.FeeBillsIssuedEvent;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFeeBillService implements FeeBillService {

    private static final DateTimeFormatter AUTO_ISSUE_YEAR_MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private final FeePolicyRepository feePolicyRepository;
    private final FeeBillRepository feeBillRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubRepository clubRepository;
    private final ClubAuthService clubAuthService;
    private final BillingPeriodResolver periodResolver;
    private final FeePaidAmountReader paidAmountReader;
    private final ApplicationEventPublisher eventPublisher;
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

        if (policy.getTargetType() == FeeTargetType.SELECTED_MEMBERS) {
            return generateForSelectedMembers(command, policy, resolved);
        }
        return generateForAllMembers(command, policy, resolved);
    }

    // ALL_MEMBERS: 활성 회원 전원에게 발행(기존 동작). created=0 은 멱등으로 그대로 허용(409 없음).
    private GenerateBillsResult generateForAllMembers(GenerateBillsCommand command, FeePolicy policy,
                                                      BillingPeriodResolver.Resolved resolved) {
        if (command.memberIds() != null && !command.memberIds().isEmpty()) {
            throw FeeBillException.InvalidBillRecipientsException.notAllowedForAllMembers();
        }
        // 단일 원자 INSERT...SELECT...ON CONFLICT DO NOTHING. created = 실제 INSERT 된 행 수.
        int created = feeBillRepository.bulkInsertBills(
                command.clubId(), policy.getId(), policy.getAmount(), resolved.billingPeriod(),
                resolved.startDate(), resolved.endDate(), resolved.dueDate());
        long activeCount = clubMemberRepository.countActiveByClubId(command.clubId());
        int skipped = (int) Math.max(0L, activeCount - created); // 동시 멤버 변동으로 음수가 되지 않게 클램프
        log.info("fee bills generated(all): actorId={}, clubId={}, policyId={}, period={}, created={}, skipped={}",
                command.actorId(), command.clubId(), policy.getId(), resolved.billingPeriod(), created, skipped);
        publishIssuedEventIfAny(command.clubId(), policy.getId(), resolved, created);
        return new GenerateBillsResult(created, skipped, List.of());
    }

    // SELECTED_MEMBERS: 지정 회원만 발행. created=0 이면 409(선택 회원 전원 이미 발행).
    private GenerateBillsResult generateForSelectedMembers(GenerateBillsCommand command, FeePolicy policy,
                                                           BillingPeriodResolver.Resolved resolved) {
        List<Long> requested = command.memberIds();
        if (requested == null || requested.isEmpty()) {
            throw FeeBillException.InvalidBillRecipientsException.requiredForSelectedMembers();
        }
        List<Long> memberIds = requested.stream().distinct().toList();
        Set<Long> clubMemberIds = new HashSet<>(
                clubMemberRepository.findClubMemberUserIdsIncludingDeleted(command.clubId(), memberIds));
        if (!clubMemberIds.containsAll(memberIds)) {
            throw FeeBillException.InvalidBillRecipientsException.notClubMembers();
        }
        List<Long> createdUserIds = feeBillRepository.bulkInsertBillsForMembers(
                command.clubId(), policy.getId(), policy.getAmount(), resolved.billingPeriod(),
                resolved.startDate(), resolved.endDate(), resolved.dueDate(), memberIds);
        if (createdUserIds.isEmpty()) {
            throw new FeeBillException.NoBillsCreatedException();
        }
        Set<Long> createdSet = new HashSet<>(createdUserIds);
        List<Long> skippedUserIds = memberIds.stream().filter(userId -> !createdSet.contains(userId)).toList();
        log.info("fee bills generated(selected): actorId={}, clubId={}, policyId={}, period={}, created={}, skipped={}",
                command.actorId(), command.clubId(), policy.getId(), resolved.billingPeriod(),
                createdUserIds.size(), skippedUserIds.size());
        publishIssuedEventIfAny(command.clubId(), policy.getId(), resolved, createdUserIds.size());
        return new GenerateBillsResult(createdUserIds.size(), skippedUserIds.size(), skippedUserIds);
    }

    // 새 청구가 있을 때만 발행 알림을 fan-out 한다(billId dedup 으로 재알림은 리스너에서 흡수).
    private void publishIssuedEventIfAny(Long clubId, Long policyId, BillingPeriodResolver.Resolved resolved, int created) {
        if (created > 0) {
            String clubName = clubRepository.findById(clubId).map(Club::getName).orElse("동아리");
            eventPublisher.publishEvent(new FeeBillsIssuedEvent(
                    clubId, clubName, policyId, resolved.billingPeriod(),
                    resolved.startDate(), resolved.dueDate()));
        }
    }

    @Override
    @Transactional
    public void autoIssueMonthly(FeePolicy policy, LocalDate today) {
        // 크론 조회(findAutoIssueDue, 비트랜잭션)와 발행 사이의 정책 변경/비활성/삭제 경합을 막기 위해
        // TX 내에서 정책 행을 재조회+비관 잠금한다(generate 와 동일한 policy-only 잠금 → 락 순서 일관, 데드락 없음).
        // 삭제된 정책은 @SQLRestriction 으로 빈 Optional → no-op.
        FeePolicy lockedPolicy = feePolicyRepository
                .findByIdAndClubIdForUpdate(policy.getId(), policy.getClubId())
                .orElse(null);
        // 방어적 no-op: 잠금 후 fresh 상태로 재확인(권한 검증은 없음 — 시스템 권위).
        if (lockedPolicy == null || !lockedPolicy.isActive()
                || lockedPolicy.getBillingType() != BillingType.MONTHLY || !lockedPolicy.isAutoIssue()) {
            return;
        }
        String yearMonth = today.format(AUTO_ISSUE_YEAR_MONTH);
        BillingPeriodResolver.Resolved resolved = periodResolver.resolveMonthly(yearMonth);
        // 마감일은 정책 dueDay 로 산출(말일 아님). 과거 검증 없음 — 캐치업 발행 시 과거여도 정상(연체 크론이 처리).
        LocalDate dueDate = LocalDate.of(today.getYear(), today.getMonth(), lockedPolicy.getDueDay());

        int created = feeBillRepository.bulkInsertBills(
                lockedPolicy.getClubId(), lockedPolicy.getId(), lockedPolicy.getAmount(), resolved.billingPeriod(),
                resolved.startDate(), resolved.endDate(), dueDate);

        log.info("auto-issue monthly bills: clubId={}, policyId={}, period={}, created={}",
                lockedPolicy.getClubId(), lockedPolicy.getId(), resolved.billingPeriod(), created);

        // 새 청구가 생성된 경우에만 발행 알림(이미 그 달 발행이면 created=0 → 재알림 없음, 캐치업 안전).
        if (created > 0) {
            String clubName = clubRepository.findById(lockedPolicy.getClubId())
                    .map(Club::getName).orElse("동아리");
            eventPublisher.publishEvent(new FeeBillsIssuedEvent(
                    lockedPolicy.getClubId(), clubName, lockedPolicy.getId(), resolved.billingPeriod(),
                    resolved.startDate(), dueDate));
        }
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

    @Override
    @Transactional(readOnly = true)
    public Page<FeeBillResponse> getBills(Long clubId, Long actorId, BillSearchQuery query, Pageable pageable) {
        clubAuthService.requireManager(actorId, clubId);
        Page<FeeBill> page = feeBillRepository.searchClubBills(clubId, query, pageable);
        Map<Long, Long> paidByBill = paidAmountReader.paidAmountByBillId(
                page.getContent().stream().map(FeeBill::getId).toList());
        return page.map(bill -> FeeBillResponse.from(
                FeeBillQuery.from(bill, paidByBill.getOrDefault(bill.getId(), 0L))));
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
