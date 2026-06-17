package com.duing.domain.fee.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.FeePolicy;
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
        FeePolicy policy = FeePolicy.create(command.clubId(), command.name(), command.amount(), command.billingType());
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
