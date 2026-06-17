package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.exception.BankMatchingException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.MatchCandidate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link TransactionMatcher} 기본 구현체.
 *
 * <p>후보 선정({@link #chooseCandidate})은 읽기 전용으로 Tier 를 가른 뒤, 실제 납부 생성·상태 전이는
 * {@link MatchedPaymentService#createMatchedPayment}(거래·청구 비관적 잠금 + 자체 트랜잭션)에 위임한다.
 * 후보 조회와 매칭 적용 사이에 잔액·상태가 변동되는 동시성은 잠금 단계의 예외로 드러나며, 이때는 자동매칭을
 * 포기하고 거래를 PENDING(검토 큐)으로 남긴다(예외를 던지지 않고 false 반환).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralTransactionMatcher implements TransactionMatcher {

    private final FeeBillRepository feeBillRepository;
    private final MatchedPaymentService matchedPaymentService;

    // 후보 조회는 트랜잭션 없이(auto-commit) 읽고, 실제 매칭은 createMatchedPayment 가 여는 자체 트랜잭션에 맡긴다.
    // NOT_SUPPORTED 로 명시하지 않으면 클래스 기본 readOnly 트랜잭션이 열리고, 그 안에서 호출된
    // createMatchedPayment(REQUIRED)가 같은 트랜잭션에 참여해 (a) 쓰기가 read-only 로 막히고
    // (b) AFTER_COMMIT 자동확인 알림이 동기화 전체가 끝날 때까지 미뤄진다.
    @Override
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public boolean tryAutoMatch(BankTransaction transaction, Long actorId) {
        List<MatchCandidate> candidates = feeBillRepository.findMatchCandidates(
                transaction.getClubId(), transaction.getAmount());
        MatchCandidate chosen = chooseCandidate(transaction, candidates);
        if (chosen == null) {
            return false; // Tier 3: 검토 큐(PENDING 유지)
        }
        try {
            matchedPaymentService.createMatchedPayment(
                    transaction, chosen.feeBillId(), actorId, MatchStatus.AUTO_MATCHED, true);
            return true;
        } catch (BankMatchingException.MatchAmountMismatchException
                 | BankMatchingException.AlreadyMatchedException
                 | BankMatchingException.BillNotMatchableException raceLost) {
            // 동시성: 후보 조회와 잠금 획득 사이에 잔액/상태가 변동되거나 청구가 취소됨 → 자동매칭 포기, 검토 큐로.
            log.debug("자동매칭 동시성 충돌 — 검토 큐로 이전: bankTransactionId={}", transaction.getId());
            return false;
        }
    }

    /**
     * Tier 규칙으로 자동매칭 대상 후보 1건을 고른다. 좁혀지지 않으면 {@code null}(검토 큐).
     *
     * <p>Tier 1(전 은행): 잔액==입금액 후보가 정확히 1건. Tier 2(KB 한정): 후보 2건 이상에서 KB 입금자명으로
     * 정확히 1건으로 좁혀질 때만 자동매칭. KB 가 아니거나 이름이 비었거나 동명이인으로 1건이 안 되면 보류.
     */
    private MatchCandidate chooseCandidate(BankTransaction transaction, List<MatchCandidate> candidates) {
        if (candidates.size() == 1) {
            return candidates.get(0); // Tier 1 (전 은행)
        }
        if (candidates.size() >= 2 && "KB".equals(transaction.getBankCode())
                && transaction.getCounterparty() != null && !transaction.getCounterparty().isBlank()) {
            List<MatchCandidate> byName = candidates.stream()
                    .filter(candidate -> normalize(candidate.memberName())
                            .equals(normalize(transaction.getCounterparty())))
                    .toList();
            if (byName.size() == 1) {
                return byName.get(0); // Tier 2 (KB 이름 보조)
            }
        }
        return null; // Tier 3
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("\\s", "");
    }
}
