package com.duing.domain.fee.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.exception.FeePolicyException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.dto.command.CreateFeePolicyCommand;
import com.duing.domain.fee.service.dto.command.UpdateFeePolicyCommand;
import com.duing.domain.fee.service.dto.query.FeePolicyQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFeePolicyService implements FeePolicyService {

    private final FeePolicyRepository feePolicyRepository;
    private final FeeBillRepository feeBillRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public Long create(CreateFeePolicyCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        FeePolicy policy = FeePolicy.create(command.clubId(), command.name(), command.amount(),
                command.billingType(), command.targetType());
        if (Boolean.TRUE.equals(command.autoIssue())) {
            validateAutoIssue(command.billingType(), command.targetType(), command.issueDay(), command.dueDay());
            policy.applyAutoIssue(true, command.issueDay(), command.dueDay());
        }
        return feePolicyRepository.save(policy).getId();
    }

    @Override
    @Transactional
    public void update(UpdateFeePolicyCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 잠금 조회로 동시 발행(generate)과 직렬화 — 발행 중 billing_type 변경/삭제 경합 방지.
        FeePolicy policy = feePolicyRepository.findByIdAndClubIdForUpdate(command.policyId(), command.clubId())
                .orElseThrow(FeePolicyException.FeePolicyNotFoundException::new);
        // billing_type 은 발행 이력(취소·soft-delete 포함)이 있으면 불변. 값이 실제로 달라질 때만 검사(동일값 PATCH 통과).
        boolean changesBillingType = command.billingType() != null
                && command.billingType() != policy.getBillingType();
        if (changesBillingType && feeBillRepository.existsByFeePolicyId(command.policyId())) {
            throw new FeePolicyException.FeePolicyBillingTypeImmutableException();
        }
        policy.update(command.name(), command.amount(), command.billingType(), command.active());
        // autoIssue 미전송(null)은 기존 자동발행 설정 유지. 명시 true/false 일 때만 반영한다.
        if (command.autoIssue() != null) {
            if (command.autoIssue()) {
                // billingType 미전송 시 기존 타입 유지되므로 policy 의 최신 타입으로 검증한다. targetType 은 불변.
                validateAutoIssue(policy.getBillingType(), policy.getTargetType(), command.issueDay(), command.dueDay());
                policy.applyAutoIssue(true, command.issueDay(), command.dueDay());
            } else {
                policy.applyAutoIssue(false, null, null);
            }
        } else if (policy.isAutoIssue() && policy.getBillingType() != BillingType.MONTHLY) {
            // autoIssue 미전송이지만 billingType 변경으로 자동발행 정합성이 깨진 경우(MONTHLY 아님 + autoIssue=true).
            // DB CHECK(ck_fee_policy_auto_issue) 가 잡기 전에 의미 있는 400 으로 막는다.
            throw new FeePolicyException.AutoIssueNotMonthlyException();
        }
    }

    // 생성·수정 공유 검증: 자동발행은 ALL_MEMBERS + MONTHLY 한정, 발행일·마감일 1~28, 마감일 >= 발행일.
    // dueDay >= issueDay 교차 조건은 Bean Validation(@Min/@Max)으로 표현 불가하여 여기서만 검증한다.
    private void validateAutoIssue(BillingType billingType, FeeTargetType targetType, Integer issueDay, Integer dueDay) {
        if (targetType != FeeTargetType.ALL_MEMBERS) {
            throw new FeePolicyException.AutoIssueRequiresAllMembersException();
        }
        if (billingType != BillingType.MONTHLY) {
            throw new FeePolicyException.AutoIssueNotMonthlyException();
        }
        if (issueDay == null || dueDay == null
                || issueDay < 1 || issueDay > 28 || dueDay < 1 || dueDay > 28
                || dueDay < issueDay) {
            throw new FeePolicyException.InvalidIssueScheduleException();
        }
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long actorId, Long policyId) {
        clubAuthService.requireManager(actorId, clubId);
        FeePolicy policy = feePolicyRepository.findByIdAndClubIdForUpdate(policyId, clubId)
                .orElseThrow(FeePolicyException.FeePolicyNotFoundException::new);
        if (feeBillRepository.existsByFeePolicyId(policyId)) { // update 와 동일한 '발행 이력 존재' 검사 공유
            throw new FeePolicyException.FeePolicyDeleteForbiddenException();
        }
        feePolicyRepository.delete(policy); // @SQLDelete soft delete
    }

    @Override
    public List<FeePolicyQuery> getPolicies(Long clubId, Long actorId) {
        clubAuthService.requireManager(actorId, clubId);
        return feePolicyRepository.findAllByClubIdOrderByCreatedAtDesc(clubId).stream()
                .map(FeePolicyQuery::from).toList();
    }
}
